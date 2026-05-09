import axios from "axios";

// ============ Auth Types ============

export type BasicAuthConfig = {
  type: "basic";
  baseUrl: string;
  email: string;
  apiToken: string;
};

export type OAuthConfig = {
  type: "oauth";
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  cloudId: string;
  expiresAt?: number;
};

export type AuthConfig = BasicAuthConfig | OAuthConfig;

// ============ Constants ============

const AUTH_SERVICE = "jira-mcp";
const AUTH_ACCOUNT = "default";

const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize";
const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
export const ATLASSIAN_API_URL = "https://api.atlassian.com";
const ATLASSIAN_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

// ============ State ============

let inMemoryAuth: AuthConfig | null = null;
let keytarModule: typeof import("keytar") | null | undefined = undefined;

// ============ Helpers ============

async function getKeytar() {
  if (keytarModule !== undefined) {
    return keytarModule;
  }
  try {
    keytarModule = await import("keytar");
  } catch {
    keytarModule = null;
  }
  return keytarModule;
}

export function normalizeBaseUrl(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("baseUrl must be a valid URL like https://your-domain.atlassian.net");
  }
  const trimmedPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${trimmedPath}`;
}

// ============ Basic Auth ============

export function basicAuthFromEnv(): BasicAuthConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) {
    return null;
  }
  return {
    type: "basic",
    baseUrl: normalizeBaseUrl(baseUrl),
    email,
    apiToken,
  };
}

// ============ OAuth Functions ============

export function oauthFromEnv(): OAuthConfig | null {
  const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
  const accessToken = process.env.JIRA_OAUTH_ACCESS_TOKEN;
  const refreshToken = process.env.JIRA_OAUTH_REFRESH_TOKEN;
  const cloudId = process.env.JIRA_CLOUD_ID;

  if (!clientId || !clientSecret || !accessToken || !cloudId) {
    return null;
  }
  return {
    type: "oauth",
    clientId,
    clientSecret,
    accessToken,
    refreshToken,
    cloudId,
  };
}

export function generateAuthorizationUrl(clientId: string, redirectUri: string, scopes: Array<string>, state: string): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: scopes.join(" "),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${ATLASSIAN_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const response = await axios.post(ATLASSIAN_TOKEN_URL, {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  }, {
    headers: { "Content-Type": "application/json" },
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in,
  };
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const response = await axios.post(ATLASSIAN_TOKEN_URL, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }, {
    headers: { "Content-Type": "application/json" },
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in,
  };
}

export async function getAccessibleResources(accessToken: string): Promise<Array<{
  id: string;
  name: string;
  url: string;
  scopes: Array<string>;
}>> {
  const response = await axios.get(ATLASSIAN_RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  return response.data;
}

export async function getCloudIdFromResources(accessToken: string, siteUrl?: string): Promise<{ cloudId: string; siteName: string; siteUrl: string }> {
  const resources = await getAccessibleResources(accessToken);
  
  if (resources.length === 0) {
    throw new Error("No accessible Jira sites found. Make sure your OAuth app has the correct scopes and you have granted access.");
  }

  if (siteUrl) {
    const normalizedSiteUrl = normalizeBaseUrl(siteUrl);
    const resource = resources.find(r => normalizeBaseUrl(r.url) === normalizedSiteUrl);
    if (resource) {
      return { cloudId: resource.id, siteName: resource.name, siteUrl: resource.url };
    }
    throw new Error(`Site ${siteUrl} not found in accessible resources. Available sites: ${resources.map(r => r.url).join(", ")}`);
  }

  const resource = resources[0];
  if (!resource) {
    throw new Error("No accessible Jira resources found");
  }
  return { cloudId: resource.id, siteName: resource.name, siteUrl: resource.url };
}

// ============ Auth Management ============

async function authFromKeytar(): Promise<AuthConfig | null> {
  const keytar = await getKeytar();
  if (!keytar) return null;
  const stored = await keytar.getPassword(AUTH_SERVICE, AUTH_ACCOUNT);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as AuthConfig;
    if (parsed.type === "basic") {
      return {
        ...parsed,
        baseUrl: normalizeBaseUrl(parsed.baseUrl),
      };
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getAuthOrThrow(): Promise<AuthConfig> {
  if (inMemoryAuth) {
    // Check if OAuth token needs refresh
    if (inMemoryAuth.type === "oauth" && inMemoryAuth.expiresAt && inMemoryAuth.refreshToken) {
      const now = Date.now();
      if (now >= inMemoryAuth.expiresAt - 5 * 60 * 1000) {
        try {
          const tokens = await refreshAccessToken(
            inMemoryAuth.clientId,
            inMemoryAuth.clientSecret,
            inMemoryAuth.refreshToken
          );
          inMemoryAuth = {
            ...inMemoryAuth,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || inMemoryAuth.refreshToken,
            expiresAt: Date.now() + tokens.expiresIn * 1000,
          };
        } catch (error) {
          console.error("Failed to refresh OAuth token:", error);
        }
      }
    }
    return inMemoryAuth;
  }

  const oauthEnv = oauthFromEnv();
  if (oauthEnv) return oauthEnv;

  const basicEnv = basicAuthFromEnv();
  if (basicEnv) return basicEnv;

  const keytarAuth = await authFromKeytar();
  if (keytarAuth) return keytarAuth;

  throw new Error("MISSING_AUTH");
}

export async function setAuth(auth: AuthConfig, persist: boolean) {
  inMemoryAuth = auth;
  if (!persist) return;
  const keytar = await getKeytar();
  if (!keytar) {
    throw new Error("Keytar is not available to persist credentials.");
  }
  await keytar.setPassword(AUTH_SERVICE, AUTH_ACCOUNT, JSON.stringify(auth));
}

export async function clearAuth() {
  inMemoryAuth = null;
  const keytar = await getKeytar();
  if (!keytar) return;
  await keytar.deletePassword(AUTH_SERVICE, AUTH_ACCOUNT);
}
