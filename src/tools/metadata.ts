import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { normalizeFieldText } from "../utils.js";
import { READ_ONLY } from "../annotations.js";

export function registerMetadataTools(server: McpServer): void {
  server.registerTool(
    "jira_get_issue_types",
    {
      title: "Get Issue Types",
      description: "Get available issue types, optionally filtered by project.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        projectKey: z.string().optional().describe("Filter issue types for a specific project"),
      }),
    },
    withClient(async (client, _auth, { projectKey }) => {
      let issueTypes;
      if (projectKey) {
        const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
        issueTypes = response.data?.issueTypes || [];
      } else {
        const response = await client.get("/rest/api/3/issuetype");
        issueTypes = response.data || [];
      }
      return issueTypes.map((it: any) => ({
        id: it.id, name: it.name, description: it.description || "",
        subtask: it.subtask ?? false, hierarchyLevel: it.hierarchyLevel,
      }));
    })
  );

  server.registerTool(
    "jira_get_priorities",
    {
      title: "Get Priorities",
      description: "Get available priority levels for issues.",
      annotations: READ_ONLY,
      inputSchema: z.object({}),
    },
    withClient(async (client) => {
      const response = await client.get("/rest/api/3/priority");
      return (response.data || []).map((p: any) => ({
        id: p.id, name: p.name, description: p.description || "", iconUrl: p.iconUrl,
      }));
    })
  );

  server.registerTool(
    "jira_get_statuses",
    {
      title: "Get Statuses",
      description: "Get available statuses, optionally filtered by project.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        projectKey: z.string().optional().describe("Filter statuses for a specific project"),
      }),
    },
    withClient(async (client, _auth, { projectKey }) => {
      if (projectKey) {
        const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);
        return response.data || [];
      }
      const response = await client.get("/rest/api/3/status");
      return (response.data || []).map((s: any) => ({
        id: s.id, name: s.name, description: s.description || "",
        statusCategory: s.statusCategory?.name,
      }));
    })
  );

  server.registerTool(
    "jira_get_components",
    {
      title: "Get Project Components",
      description: "Get components for a specific project.",
      annotations: READ_ONLY,
      inputSchema: z.object({ projectKey: z.string().min(1).describe("Project key") }),
    },
    withClient(async (client, _auth, { projectKey }) => {
      const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}/components`);
      return (response.data || []).map((c: any) => ({
        id: c.id, name: c.name, description: c.description || "",
        lead: c.lead?.displayName, assigneeType: c.assigneeType,
      }));
    })
  );

  server.registerTool(
    "jira_get_versions",
    {
      title: "Get Project Versions",
      description: "Get versions for a specific project.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        projectKey: z.string().min(1).describe("Project key"),
        released: z.boolean().optional().describe("Filter by released status"),
      }),
    },
    withClient(async (client, _auth, { projectKey, released }) => {
      const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}/versions`);
      let versions = response.data || [];
      if (released !== undefined) {
        versions = versions.filter((v: any) => v.released === released);
      }
      return versions.map((v: any) => ({
        id: v.id, name: v.name, description: v.description || "",
        released: v.released ?? false, archived: v.archived ?? false,
        releaseDate: v.releaseDate, startDate: v.startDate,
      }));
    })
  );

  server.registerTool(
    "jira_search_users",
    {
      title: "Search Jira Users",
      description: "Search for Jira users by name, email, or username.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        query: z.string().min(1).describe("Search query (name, email, or username)"),
        projectKey: z.string().optional().describe("Filter users with access to this project"),
        maxResults: z.number().int().positive().max(50).optional().default(10),
      }),
    },
    withClient(async (client, _auth, { query, projectKey, maxResults }) => {
      const response = await client.get("/rest/api/3/user/search", {
        params: { query, maxResults: maxResults ?? 10 },
      });
      let users = response.data || [];
      if (projectKey && users.length > 0) {
        try {
          const assignableResponse = await client.get("/rest/api/3/user/assignable/search", {
            params: { query, project: projectKey, maxResults: maxResults ?? 10 },
          });
          users = assignableResponse.data || [];
        } catch {
          // Fall back to original search
        }
      }
      return users.map((u: any) => ({
        accountId: u.accountId, displayName: u.displayName,
        emailAddress: u.emailAddress, active: u.active ?? true,
        avatarUrl: u.avatarUrls?.["48x48"],
      }));
    })
  );

  server.registerTool(
    "jira_get_changelog",
    {
      title: "Get Issue Changelog",
      description: "Get the history of changes for an issue.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional().default(20),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, startAt, maxResults }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/changelog`,
        { params: { startAt, maxResults: maxResults ?? 20 } }
      );
      const changes = Array.isArray(response.data?.values)
        ? response.data.values.map((change: any) => ({
            id: change.id,
            author: change.author?.displayName || change.author?.emailAddress || "",
            created: change.created,
            items: (change.items || []).map((item: any) => ({
              field: item.field, fieldtype: item.fieldtype,
              from: item.fromString || item.from, to: item.toString || item.to,
            })),
          }))
        : [];
      return { total: response.data?.total ?? changes.length, startAt: response.data?.startAt ?? 0, changes };
    })
  );

  server.registerTool(
    "jira_get_fields",
    {
      title: "Get All Fields",
      description: "Get all available fields including custom fields.",
      annotations: READ_ONLY,
      inputSchema: z.object({}),
    },
    withClient(async (client) => {
      const response = await client.get("/rest/api/3/field");
      return (response.data || []).map((f: any) => ({
        id: f.id, key: f.key, name: f.name,
        custom: f.custom ?? false, orderable: f.orderable ?? false,
        navigable: f.navigable ?? false, searchable: f.searchable ?? false,
        clauseNames: f.clauseNames || [], schema: f.schema,
      }));
    })
  );

  server.registerTool(
    "jira_get_create_metadata",
    {
      title: "Get Create Issue Metadata",
      description:
        "Get metadata for creating issues in a project, including available issue types and their fields. Uses the modern non-deprecated API endpoints.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        projectIdOrKey: z.string().min(1).describe("Project key or ID (required)"),
        issueTypeId: z.string().optional().describe("Issue type ID to get field metadata for (optional - if not provided, returns available issue types)"),
        startAt: z.number().optional().describe("Starting index for pagination"),
        maxResults: z.number().optional().describe("Maximum results (default 50, max 50)"),
      }),
    },
    withClient(async (client, _auth, { projectIdOrKey, issueTypeId, startAt, maxResults }) => {
      if (issueTypeId) {
        const response = await client.get(
          `/rest/api/3/issue/createmeta/${encodeURIComponent(projectIdOrKey)}/issuetypes/${encodeURIComponent(issueTypeId)}`,
          { params: { startAt: startAt || 0, maxResults: maxResults || 50 } }
        );
        return response.data;
      }
      const response = await client.get(
        `/rest/api/3/issue/createmeta/${encodeURIComponent(projectIdOrKey)}/issuetypes`,
        { params: { startAt: startAt || 0, maxResults: maxResults || 50 } }
      );
      return response.data;
    })
  );

  server.registerTool(
    "jira_get_edit_metadata",
    {
      title: "Get Edit Issue Metadata",
      description: "Get metadata for editing a specific issue, including editable fields.",
      annotations: READ_ONLY,
      inputSchema: z.object({ issueIdOrKey: z.string().min(1).describe("Issue key or ID") }),
    },
    withClient(async (client, _auth, { issueIdOrKey }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/editmeta`
      );
      return response.data;
    })
  );
}
