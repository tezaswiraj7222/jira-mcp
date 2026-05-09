import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { READ_ONLY, WRITE_IDEMPOTENT } from "../annotations.js";

export function registerEpicTools(server: McpServer): void {
  server.registerTool(
    "jira_get_epics",
    {
      title: "Get Epics",
      description: "Get epics for a board.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
        done: z.enum(["true", "false"]).optional().describe("Filter by completion status"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional().default(50),
      }),
    },
    withClient(async (client, _auth, { boardId, done, startAt, maxResults }) => {
      const response = await client.get(`/rest/agile/1.0/board/${boardId}/epic`, {
        params: { done, startAt, maxResults: maxResults ?? 50 },
      });
      const epics = Array.isArray(response.data?.values)
        ? response.data.values.map((e: any) => ({
            id: e.id, key: e.key, name: e.name,
            summary: e.summary, done: e.done ?? false,
          }))
        : [];
      return { total: response.data?.total ?? epics.length, startAt: response.data?.startAt ?? 0, boardId, epics };
    })
  );

  server.registerTool(
    "jira_get_epic_issues",
    {
      title: "Get Epic Issues",
      description: "Get all issues belonging to an epic.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        epicIdOrKey: z.string().min(1).describe("Epic ID or key"),
        jql: z.string().optional().describe("Additional JQL filter"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional().default(50),
      }),
    },
    withClient(async (client, _auth, { epicIdOrKey, jql, fields, startAt, maxResults }) => {
      const response = await client.get(`/rest/agile/1.0/epic/${epicIdOrKey}/issue`, {
        params: { jql, fields: fields?.join(","), startAt, maxResults: maxResults ?? 50 },
      });
      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map((issue: any) => ({
            key: issue.key, summary: issue.fields?.summary,
            status: issue.fields?.status?.name, assignee: issue.fields?.assignee?.displayName,
            issueType: issue.fields?.issuetype?.name,
          }))
        : [];
      return { total: response.data?.total ?? issues.length, startAt: response.data?.startAt ?? 0, epicKey: epicIdOrKey, issues };
    })
  );

  server.registerTool(
    "jira_move_issues_to_epic",
    {
      title: "Move Issues to Epic",
      description: "Move issues to an epic.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        epicIdOrKey: z.string().min(1).describe("Epic ID or key"),
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move"),
      }),
    },
    withClient(async (client, _auth, { epicIdOrKey, issueKeys }) => {
      await client.post(`/rest/agile/1.0/epic/${epicIdOrKey}/issue`, { issues: issueKeys });
      return {
        success: true, epicKey: epicIdOrKey, issuesMoved: issueKeys,
        message: `${issueKeys.length} issue(s) moved to epic ${epicIdOrKey}`,
      };
    })
  );

  server.registerTool(
    "jira_remove_issues_from_epic",
    {
      title: "Remove Issues from Epic",
      description: "Remove issues from their epic (move to no epic).",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to remove from epic"),
      }),
    },
    withClient(async (client, _auth, { issueKeys }) => {
      await client.post("/rest/agile/1.0/epic/none/issue", { issues: issueKeys });
      return {
        success: true, issuesRemoved: issueKeys,
        message: `${issueKeys.length} issue(s) removed from epic`,
      };
    })
  );
}
