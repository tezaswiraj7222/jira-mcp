import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { READ_ONLY, WRITE_IDEMPOTENT } from "../annotations.js";

export function registerLabelJqlTools(server: McpServer): void {
  // ============ Labels ============

  server.registerTool(
    "jira_get_all_labels",
    {
      title: "Get All Labels",
      description: "Get all labels used across all issues in the Jira instance.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        startAt: z.number().optional().default(0).describe("Index of first result"),
        maxResults: z.number().optional().default(1000).describe("Maximum results to return"),
      }),
    },
    withClient(async (client, _auth, { startAt, maxResults }) => {
      const response = await client.get("/rest/api/3/label", {
        params: { startAt, maxResults },
      });
      return {
        total: response.data.total, maxResults: response.data.maxResults,
        startAt: response.data.startAt, labels: response.data.values || [],
      };
    })
  );

  server.registerTool(
    "jira_add_labels",
    {
      title: "Add/Set/Remove Labels",
      description:
        "Add, set, or remove labels on an issue. Use 'add' to append, 'set' to replace all, or 'remove' to delete specific labels.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        issueIdOrKey: z.string().describe("Issue ID or key"),
        labels: z.array(z.string()).min(1).describe("Labels to add/set/remove"),
        operation: z.enum(["add", "set", "remove"]).default("add").describe("Operation: 'add' appends, 'set' replaces all, 'remove' deletes specified labels"),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, labels, operation }) => {
      let updatePayload: any;
      if (operation === "set") {
        updatePayload = { fields: { labels } };
      } else {
        updatePayload = {
          update: { labels: labels.map((label) => ({ [operation]: label })) },
        };
      }

      await client.put(`/rest/api/3/issue/${issueIdOrKey}`, updatePayload);

      return {
        success: true,
        message: `Labels ${operation === "add" ? "added to" : operation === "remove" ? "removed from" : "set on"} issue ${issueIdOrKey}`,
        labels, operation,
      };
    })
  );

  // ============ JQL Tools ============

  server.registerTool(
    "jira_autocomplete_jql",
    {
      title: "Autocomplete JQL",
      description: "Get autocomplete suggestions for JQL field values. Useful for building JQL queries interactively.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        fieldName: z.string().optional().describe("Field name to get value suggestions for (e.g., status, priority, assignee)"),
        fieldValue: z.string().optional().describe("Partial value to autocomplete"),
        predicateName: z.string().optional().describe("Predicate name for function suggestions"),
        predicateValue: z.string().optional().describe("Partial predicate value to autocomplete"),
      }),
    },
    withClient(async (client, _auth, { fieldName, fieldValue, predicateName, predicateValue }) => {
      const response = await client.get("/rest/api/3/jql/autocompletedata/suggestions", {
        params: { fieldName, fieldValue, predicateName, predicateValue },
      });
      return {
        results: (response.data.results || []).map((r: any) => ({
          value: r.value, displayName: r.displayName,
        })),
      };
    })
  );

  server.registerTool(
    "jira_validate_jql",
    {
      title: "Validate JQL",
      description: "Validate one or more JQL queries for syntax and semantic correctness.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        queries: z.array(z.string()).min(1).describe("JQL queries to validate"),
        validation: z.enum(["strict", "warn", "none"]).optional().default("strict").describe("Validation level: strict (errors only), warn (errors and warnings), none (no validation)"),
      }),
    },
    withClient(async (client, _auth, { queries, validation }) => {
      const response = await client.post("/rest/api/3/jql/parse", { queries, validation });
      return {
        queries: (response.data.queries || []).map((q: any) => ({
          query: q.query, errors: q.errors || [], warnings: q.warnings || [],
          isValid: !q.errors || q.errors.length === 0,
        })),
      };
    })
  );

  server.registerTool(
    "jira_parse_jql",
    {
      title: "Parse JQL",
      description: "Parse JQL queries and return their abstract syntax tree (AST) structure. Useful for understanding query structure.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        queries: z.array(z.string()).min(1).describe("JQL queries to parse"),
        validation: z.enum(["strict", "warn", "none"]).optional().default("none").describe("Validation level"),
      }),
    },
    withClient(async (client, _auth, { queries, validation }) => {
      const response = await client.post("/rest/api/3/jql/parse", { queries, validation });
      return {
        queries: (response.data.queries || []).map((q: any) => ({
          query: q.query, structure: q.structure, errors: q.errors || [],
        })),
      };
    })
  );
}
