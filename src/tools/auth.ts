import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type OAuthConfig,
  normalizeBaseUrl,
  setAuth,
  clearAuth,
  getAuthOrThrow,
  generateAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getAccessibleResources,
  getCloudIdFromResources,
} from "../auth.js";
import { textResult, errorToResult } from "../utils.js";
import { WRITE_IDEMPOTENT, WRITE_CREATE, READ_ONLY, DESTRUCTIVE } from "../annotations.js";

export function registerAuthTools(server: McpServer): void {
  server.registerTool(
    "_internal_jira_set_auth",
    {
      title: "Set Jira Auth (Basic)",
      description:
        "Use when the user wants to connect Jira using Basic Auth (email + API token). This tool should only be called when the user explicitly provides credentials.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        baseUrl: z.string(),
        email: z.string().email(),
        apiToken: z.string().min(1),
        persist: z.boolean().optional().default(false),
      }),
    },
    async ({ baseUrl, email, apiToken, persist }) => {
      const normalized = normalizeBaseUrl(baseUrl);
      await setAuth({ type: "basic", baseUrl: normalized, email, apiToken }, persist ?? false);
      return textResult("Jira credentials loaded (Basic Auth).");
    }
  );

  server.registerTool(
    "jira_oauth_get_auth_url",
    {
      title: "Get OAuth Authorization URL",
      description:
        "Generate the OAuth 2.0 authorization URL that the user should visit to grant access. Returns the URL and required state parameter.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        clientId: z.string().min(1).describe("OAuth Client ID from Atlassian Developer Console"),
        redirectUri: z.string().url().describe("Callback URL configured in your OAuth app"),
        scopes: z.array(z.string()).optional().default([
          "read:jira-work",
          "read:jira-user",
          "write:jira-work",
          "offline_access",
        ]).describe("OAuth scopes to request"),
      }),
    },
    async ({ clientId, redirectUri, scopes }) => {
      const state = Math.random().toString(36).substring(2, 15);
      const authUrl = generateAuthorizationUrl(clientId, redirectUri, scopes, state);
      return textResult({
        authUrl,
        state,
        instructions: "1. Visit the authUrl in your browser\n2. Grant access to your Jira site\n3. Copy the 'code' parameter from the redirect URL\n4. Use jira_oauth_exchange_code to exchange it for tokens",
      });
    }
  );

  server.registerTool(
    "jira_oauth_exchange_code",
    {
      title: "Exchange OAuth Code for Tokens",
      description:
        "Exchange the authorization code for access tokens after the user has completed the OAuth flow.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        code: z.string().min(1).describe("Authorization code from the OAuth callback"),
        redirectUri: z.string().url(),
        siteUrl: z.string().url().optional().describe("Optional: specific Jira site URL (e.g., https://yoursite.atlassian.net)"),
        persist: z.boolean().optional().default(false),
      }),
    },
    async ({ clientId, clientSecret, code, redirectUri, siteUrl, persist }) => {
      try {
        const tokens = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);
        const { cloudId, siteName, siteUrl: actualSiteUrl } = await getCloudIdFromResources(tokens.accessToken, siteUrl);
        
        const auth: OAuthConfig = {
          type: "oauth",
          clientId,
          clientSecret,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          cloudId,
          expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
        };
        
        await setAuth(auth, persist);
        
        return textResult({
          success: true,
          message: `Successfully authenticated with OAuth to ${siteName}`,
          site: {
            name: siteName,
            url: actualSiteUrl,
            cloudId,
          },
          hasRefreshToken: !!tokens.refreshToken,
        });
      } catch (error) {
        return textResult(errorToResult(error));
      }
    }
  );

  server.registerTool(
    "jira_oauth_set_tokens",
    {
      title: "Set OAuth Tokens Directly",
      description:
        "Set OAuth tokens directly if you already have them (e.g., from a previous session or external OAuth flow).",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        accessToken: z.string().min(1),
        refreshToken: z.string().optional(),
        cloudId: z.string().optional().describe("Cloud ID of the Jira site. If not provided, will be fetched automatically."),
        siteUrl: z.string().url().optional().describe("Jira site URL to find the correct cloudId"),
        persist: z.boolean().optional().default(false),
      }),
    },
    async ({ clientId, clientSecret, accessToken, refreshToken, cloudId, siteUrl, persist }) => {
      try {
        let finalCloudId = cloudId;
        let siteName = "";
        let actualSiteUrl = siteUrl || "";

        if (!finalCloudId) {
          const resources = await getCloudIdFromResources(accessToken, siteUrl);
          finalCloudId = resources.cloudId;
          siteName = resources.siteName;
          actualSiteUrl = resources.siteUrl;
        }

        const auth: OAuthConfig = {
          type: "oauth",
          clientId,
          clientSecret,
          accessToken,
          refreshToken,
          cloudId: finalCloudId,
        };

        await setAuth(auth, persist);

        return textResult({
          success: true,
          message: siteName ? `OAuth tokens set for ${siteName}` : "OAuth tokens set successfully",
          cloudId: finalCloudId,
          siteUrl: actualSiteUrl,
        });
      } catch (error) {
        return textResult(errorToResult(error));
      }
    }
  );

  server.registerTool(
    "jira_oauth_refresh",
    {
      title: "Refresh OAuth Token",
      description:
        "Manually refresh the OAuth access token using the refresh token.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const auth = await getAuthOrThrow();
        
        if (auth.type !== "oauth") {
          return textResult({
            error: "invalid_auth_type",
            message: "Current authentication is not OAuth. Use basic auth credentials directly.",
          });
        }

        if (!auth.refreshToken) {
          return textResult({
            error: "no_refresh_token",
            message: "No refresh token available. You need to re-authenticate with 'offline_access' scope.",
          });
        }

        const tokens = await refreshAccessToken(auth.clientId, auth.clientSecret, auth.refreshToken);
        
        const updatedAuth: OAuthConfig = {
          ...auth,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || auth.refreshToken,
          expiresAt: Date.now() + tokens.expiresIn * 1000,
        };

        await setAuth(updatedAuth, false);

        return textResult({
          success: true,
          message: "OAuth token refreshed successfully",
          expiresIn: tokens.expiresIn,
        });
      } catch (error) {
        return textResult(errorToResult(error));
      }
    }
  );

  server.registerTool(
    "jira_oauth_list_sites",
    {
      title: "List Accessible Jira Sites",
      description:
        "List all Jira sites accessible with the current OAuth token.",
      annotations: READ_ONLY,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const auth = await getAuthOrThrow();
        
        if (auth.type !== "oauth") {
          return textResult({
            error: "invalid_auth_type",
            message: "This tool requires OAuth authentication. Current auth is basic auth.",
          });
        }

        const resources = await getAccessibleResources(auth.accessToken);
        
        return textResult({
          currentCloudId: auth.cloudId,
          sites: resources.map(r => ({
            cloudId: r.id,
            name: r.name,
            url: r.url,
            scopes: r.scopes,
          })),
        });
      } catch (error) {
        return textResult(errorToResult(error));
      }
    }
  );

  server.registerTool(
    "jira_clear_auth",
    {
      title: "Clear Jira Auth",
      description: "Use when the user asks to remove or reset stored Jira credentials.",
      annotations: DESTRUCTIVE,
      inputSchema: z.object({}),
    },
    async () => {
      await clearAuth();
      return textResult("Jira credentials cleared.");
    }
  );

  server.registerTool(
    "jira_auth_status",
    {
      title: "Get Auth Status",
      description: "Check the current authentication status and type.",
      annotations: READ_ONLY,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const auth = await getAuthOrThrow();
        
        if (auth.type === "basic") {
          return textResult({
            authenticated: true,
            type: "basic",
            baseUrl: auth.baseUrl,
            email: auth.email,
          });
        }
        
        return textResult({
          authenticated: true,
          type: "oauth",
          cloudId: auth.cloudId,
          hasRefreshToken: !!auth.refreshToken,
          expiresAt: auth.expiresAt ? new Date(auth.expiresAt).toISOString() : null,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "MISSING_AUTH") {
          return textResult({
            authenticated: false,
            message: "No authentication configured. Use basic auth or OAuth to authenticate.",
          });
        }
        return textResult(errorToResult(error));
      }
    }
  );
}
