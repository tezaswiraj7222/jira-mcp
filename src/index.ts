import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createServer } from "./server.js";
import { getAuthOrThrow } from "./auth.js";
import { createClient } from "./client.js";
import { AxiosError } from "axios";

// ============ CLI Colors ============

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

// ============ CLI Handling ============

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPackageJson(): { name: string; version: string; description: string } {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    try {
      const devPkgPath = join(__dirname, "package.json");
      return JSON.parse(readFileSync(devPkgPath, "utf-8"));
    } catch {
      return { name: "mcp-jira-cloud", version: "0.0.0", description: "Jira MCP Server" };
    }
  }
}

async function verifyConnection(): Promise<void> {
  console.log(`${colors.cyan}🔍 Verifying Jira connectivity and credentials...${colors.reset}`);
  try {
    const auth = await getAuthOrThrow();
    const type = auth.type === "basic" ? "Basic Auth (API Token)" : "OAuth 2.0";
    console.log(`📡 Detected Authentication: ${colors.bold}${colors.magenta}${type}${colors.reset}`);
    
    if (auth.type === "basic") {
      console.log(`🌐 Base URL: ${colors.blue}${auth.baseUrl}${colors.reset}`);
      console.log(`👤 Email: ${colors.blue}${auth.email}${colors.reset}`);
    } else {
      console.log(`🆔 Cloud ID: ${colors.blue}${auth.cloudId}${colors.reset}`);
    }

    const client = createClient(auth);
    const response = await client.get("/rest/api/3/myself");
    
    console.log(`\n${colors.bold}${colors.green}✅ Connection Successful!${colors.reset}`);
    if (response.data && typeof response.data === "object") {
      const { displayName, emailAddress, accountType } = response.data as any;
      console.log(`👤 Connected as: ${colors.bold}${displayName}${colors.reset} (${emailAddress || "no email"})`);
      console.log(`🏷️ Account Type: ${colors.dim}${accountType}${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.bold}${colors.red}❌ Connection Failed!${colors.reset}`);
    if (error instanceof Error && error.message === "MISSING_AUTH") {
      console.error(`${colors.yellow}Error: Missing Jira credentials.${colors.reset}`);
      console.error("Please ensure you have set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.");
    } else if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;
      console.error(`${colors.bold}Status:${colors.reset} ${colors.red}${status || "unknown"}${colors.reset}`);
      if (status === 401) {
        console.error(`${colors.yellow}Troubleshooting: Unauthorized. Check if your API token or OAuth credentials are correct.${colors.reset}`);
      } else if (status === 403) {
        console.error(`${colors.yellow}Troubleshooting: Forbidden. Ensure your account has access to this Jira instance and the correct permissions.${colors.reset}`);
      } else if (status === 404) {
        console.error(`${colors.yellow}Troubleshooting: Not Found. Check if the JIRA_BASE_URL is correct.${colors.reset}`);
      }
      if (data) {
        console.error(`${colors.dim}Jira API Response:${colors.reset}`, JSON.stringify(data, null, 2));
      }
    } else {
      console.error(`${colors.red}Unexpected error:${colors.reset}`, error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

function printHelp(): void {
  const pkg = getPackageJson();
  console.log(`
${colors.bold}${colors.cyan}${pkg.name}${colors.reset} ${colors.dim}v${pkg.version}${colors.reset}
${pkg.description}

${colors.bold}${colors.blue}USAGE:${colors.reset}
  ${colors.green}npx -y mcp-jira-cloud@latest${colors.reset} [OPTIONS]
  ${colors.green}jira-mcp${colors.reset} [OPTIONS]
  ${colors.green}mcp-jira-cloud${colors.reset} [OPTIONS]

${colors.bold}${colors.blue}OPTIONS:${colors.reset}
  ${colors.cyan}-h, --help${colors.reset}       Show this help message and exit
  ${colors.cyan}-v, --version${colors.reset}    Show version number and exit
  ${colors.cyan}--verify${colors.reset}         Verify Jira connectivity and credentials
  ${colors.cyan}--verbose${colors.reset}        Enable diagnostic logging to stderr

${colors.bold}${colors.blue}FEATURES:${colors.reset}
  - 91 specialized Jira tools
  - Comprehensive Agile support (Sprints, Boards, Backlogs, Epics)
  - Issue management (Search, Create, Update, Transitions)
  - Worklog management and time tracking
  - Attachment and comment handling
  - Advanced JQL search, filters, and dashboards
  - Metadata and project exploration

${colors.bold}${colors.blue}ENVIRONMENT VARIABLES:${colors.reset}
  ${colors.italic}Basic Auth (recommended for most users):${colors.reset}
    ${colors.magenta}JIRA_BASE_URL${colors.reset}         Your Jira instance URL (e.g., https://your-domain.atlassian.net)
    ${colors.magenta}JIRA_EMAIL${colors.reset}            Your Atlassian account email
    ${colors.magenta}JIRA_API_TOKEN${colors.reset}        API token from https://id.atlassian.com/manage-profile/security/api-tokens

  ${colors.italic}OAuth 2.0 (for advanced integrations):${colors.reset}
    ${colors.magenta}JIRA_OAUTH_CLIENT_ID${colors.reset}      OAuth app client ID
    ${colors.magenta}JIRA_OAUTH_CLIENT_SECRET${colors.reset}  OAuth app client secret
    ${colors.magenta}JIRA_OAUTH_ACCESS_TOKEN${colors.reset}   Access token
    ${colors.magenta}JIRA_OAUTH_REFRESH_TOKEN${colors.reset}  Refresh token (optional)
    ${colors.magenta}JIRA_CLOUD_ID${colors.reset}             Jira Cloud ID

  ${colors.italic}Optional:${colors.reset}
    ${colors.magenta}JIRA_ACCEPTANCE_CRITERIA_FIELD${colors.reset}  Custom field ID for acceptance criteria

${colors.bold}${colors.blue}EXAMPLES:${colors.reset}
  # Run as MCP server (typical usage via AI assistant config)
  ${colors.dim}npx -y mcp-jira-cloud@latest${colors.reset}

  # Check version
  ${colors.dim}npx -y mcp-jira-cloud@latest --version${colors.reset}

  # Verify connectivity
  ${colors.dim}npx -y mcp-jira-cloud@latest --verify${colors.reset}

  # Show this help message
  ${colors.dim}npx -y mcp-jira-cloud@latest --help${colors.reset}

${colors.bold}${colors.blue}MCP CONFIGURATION:${colors.reset}
  Add to your AI assistant's MCP configuration:

  VS Code (settings.json):
    ${colors.dim}"mcp": {
      "servers": {
        "jira": {
          "command": "npx",
          "args": ["-y", "mcp-jira-cloud"],
          "env": {
            "JIRA_BASE_URL": "https://your-domain.atlassian.net",
            "JIRA_EMAIL": "your-email@example.com",
            "JIRA_API_TOKEN": "your-api-token"
          }
        }
      }
    }${colors.reset}

${colors.bold}${colors.blue}DOCUMENTATION:${colors.reset}
  ${colors.underline}https://github.com/tezaswiraj7222/jira-mcp#readme${colors.reset}

${colors.bold}${colors.blue}ISSUES:${colors.reset}
  ${colors.underline}https://github.com/tezaswiraj7222/jira-mcp/issues${colors.reset}
`);
}

function printVersion(): void {
  const pkg = getPackageJson();
  console.log(`${pkg.name} v${pkg.version}`);
}

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.includes("--verbose")) {
  (global as any).VERBOSE = true;
}

if (args.includes("-h") || args.includes("--help") || args.includes("help")) {
  printHelp();
  process.exit(0);
}

if (args.includes("-v") || args.includes("--version")) {
  printVersion();
  process.exit(0);
}

if (args.includes("--verify")) {
  await verifyConnection();
  process.exit(0);
}

// ============ Start Server ============

const server = createServer();
const transport = new StdioServerTransport();

// Graceful shutdown
function shutdown() {
  server.close().catch(() => {}).finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(transport);
