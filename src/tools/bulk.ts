import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { READ_ONLY, WRITE_CREATE, WRITE_IDEMPOTENT, DESTRUCTIVE } from "../annotations.js";

export function registerBulkTools(server: McpServer): void {
  server.registerTool(
    "jira_bulk_edit_issues",
    {
      title: "Bulk Edit Issues",
      description:
        "Edit multiple issues at once. Supports bulk editing of labels, assignee, priority, components, and fix versions. Returns a taskId to track progress.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        issueIdsOrKeys: z.array(z.string()).min(1).describe("Array of issue IDs or keys to edit"),
        editedFieldsInput: z.object({
          labels: z.object({
            add: z.array(z.string()).optional().describe("Labels to add"),
            remove: z.array(z.string()).optional().describe("Labels to remove"),
            set: z.array(z.string()).optional().describe("Labels to set (replaces all)"),
          }).optional(),
          assignee: z.object({
            accountId: z.string().describe("Account ID of the assignee"),
          }).optional(),
          priority: z.object({
            id: z.string().describe("Priority ID"),
          }).optional(),
          components: z.object({
            add: z.array(z.object({ id: z.string() })).optional(),
            remove: z.array(z.object({ id: z.string() })).optional(),
          }).optional(),
          fixVersions: z.object({
            add: z.array(z.object({ id: z.string() })).optional(),
            remove: z.array(z.object({ id: z.string() })).optional(),
          }).optional(),
        }).describe("Fields to edit with their operations"),
        sendNotifications: z.boolean().optional().default(true).describe("Whether to send email notifications"),
      }),
    },
    withClient(async (client, _auth, { issueIdsOrKeys, editedFieldsInput, sendNotifications }) => {
      const response = await client.post("/rest/api/3/bulk/issues/fields", {
        issueIdsOrKeys, editedFieldsInput, sendNotifications,
      });
      return {
        success: true, taskId: response.data.taskId,
        message: `Bulk edit initiated for ${issueIdsOrKeys.length} issues. Use jira_get_bulk_operation_progress with taskId to track progress.`,
      };
    })
  );

  server.registerTool(
    "jira_bulk_watch_issues",
    {
      title: "Bulk Watch Issues",
      description: "Add watchers to multiple issues at once. Returns a taskId to track progress.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        issueIdsOrKeys: z.array(z.string()).min(1).describe("Array of issue IDs or keys to watch"),
        accountIds: z.array(z.string()).optional().describe("Account IDs to add as watchers (defaults to current user)"),
      }),
    },
    withClient(async (client, _auth, { issueIdsOrKeys, accountIds }) => {
      const response = await client.post("/rest/api/3/bulk/issues/watch", {
        issueIdsOrKeys, ...(accountIds && { accountIds }),
      });
      return {
        success: true, taskId: response.data.taskId,
        message: `Bulk watch initiated for ${issueIdsOrKeys.length} issues. Use jira_get_bulk_operation_progress with taskId to track progress.`,
      };
    })
  );

  server.registerTool(
    "jira_bulk_unwatch_issues",
    {
      title: "Bulk Unwatch Issues",
      description: "Remove watchers from multiple issues at once. Returns a taskId to track progress.",
      annotations: DESTRUCTIVE,
      inputSchema: z.object({
        issueIdsOrKeys: z.array(z.string()).min(1).describe("Array of issue IDs or keys to unwatch"),
        accountIds: z.array(z.string()).optional().describe("Account IDs to remove as watchers (defaults to current user)"),
      }),
    },
    withClient(async (client, _auth, { issueIdsOrKeys, accountIds }) => {
      const response = await client.post("/rest/api/3/bulk/issues/unwatch", {
        issueIdsOrKeys, ...(accountIds && { accountIds }),
      });
      return {
        success: true, taskId: response.data.taskId,
        message: `Bulk unwatch initiated for ${issueIdsOrKeys.length} issues. Use jira_get_bulk_operation_progress with taskId to track progress.`,
      };
    })
  );

  server.registerTool(
    "jira_get_bulk_operation_progress",
    {
      title: "Get Bulk Operation Progress",
      description: "Check the progress of an async bulk operation using its taskId.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        taskId: z.string().describe("The task ID returned from a bulk operation"),
      }),
    },
    withClient(async (client, _auth, { taskId }) => {
      const response = await client.get(`/rest/api/3/bulk/queue/${taskId}`);
      const data = response.data;
      return {
        taskId: data.taskId, status: data.status, progress: data.progress,
        submittedBy: data.submittedBy, created: data.created,
        started: data.started, finished: data.finished,
        successfulIssues: data.successfulIssues || [],
        failedIssues: data.failedIssues || [],
        totalIssues: (data.successfulIssues?.length || 0) + (data.failedIssues?.length || 0),
      };
    })
  );
}
