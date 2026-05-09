import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Tool registrations
import { registerAuthTools } from "./tools/auth.js";
import { registerCoreTools } from "./tools/core.js";
import { registerAgileTools } from "./tools/agile.js";
import { registerRelationshipTools } from "./tools/relationships.js";
import { registerMetadataTools } from "./tools/metadata.js";
import { registerFilterDashboardTools } from "./tools/filters-dashboards.js";
import { registerBulkTools } from "./tools/bulk.js";
import { registerAttachmentTools } from "./tools/attachments.js";
import { registerEpicTools } from "./tools/epics.js";
import { registerWorklogTools } from "./tools/worklogs.js";
import { registerLabelJqlTools } from "./tools/labels-jql.js";

// ============ Version Resolution ============

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const devPkgPath = join(__dirname, "package.json");
      const pkg = JSON.parse(readFileSync(devPkgPath, "utf-8"));
      return pkg.version || "0.0.0";
    } catch {
      return "0.0.0";
    }
  }
}

// ============ Server Setup ============

export function createServer(): McpServer {
  const version = getVersion();

  const server = new McpServer({
    name: "jira-mcp",
    version,
  });

  // Register all tool groups
  registerAuthTools(server);
  registerCoreTools(server);
  registerAgileTools(server);
  registerRelationshipTools(server);
  registerMetadataTools(server);
  registerFilterDashboardTools(server);
  registerBulkTools(server);
  registerAttachmentTools(server);
  registerEpicTools(server);
  registerWorklogTools(server);
  registerLabelJqlTools(server);

  return server;
}
