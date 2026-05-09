import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { READ_ONLY, WRITE_CREATE, WRITE_IDEMPOTENT } from "../annotations.js";

export function registerFilterDashboardTools(server: McpServer): void {
  // ============ Filters ============

  server.registerTool(
    "jira_get_filters",
    {
      title: "Get Filters",
      description: "Get saved filters, optionally filtered by name.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        filterName: z.string().optional().describe("Filter by name (contains)"),
        owner: z.string().optional().describe("Filter by owner account ID"),
        expand: z.string().optional().describe("Expand options: description, owner, jql, viewUrl, searchUrl, favourite, favouritedCount, sharePermissions"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional().default(50),
      }),
    },
    withClient(async (client, _auth, { filterName, owner, expand, startAt, maxResults }) => {
      const response = await client.get("/rest/api/3/filter/search", {
        params: { filterName, owner, expand, startAt, maxResults: maxResults ?? 50 },
      });
      const filters = Array.isArray(response.data?.values)
        ? response.data.values.map((f: any) => ({
            id: f.id, name: f.name, description: f.description,
            owner: f.owner?.displayName, jql: f.jql,
            favourite: f.favourite ?? false, favouritedCount: f.favouritedCount ?? 0,
          }))
        : [];
      return { total: response.data?.total ?? filters.length, startAt: response.data?.startAt ?? 0, filters };
    })
  );

  server.registerTool(
    "jira_get_filter",
    {
      title: "Get Filter Details",
      description: "Get details of a specific filter.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        filterId: z.string().min(1).describe("Filter ID"),
        expand: z.string().optional().describe("Expand options"),
      }),
    },
    withClient(async (client, _auth, { filterId, expand }) => {
      const response = await client.get(`/rest/api/3/filter/${filterId}`, { params: { expand } });
      return {
        id: response.data?.id, name: response.data?.name,
        description: response.data?.description, owner: response.data?.owner?.displayName,
        jql: response.data?.jql, favourite: response.data?.favourite ?? false,
        sharePermissions: response.data?.sharePermissions,
      };
    })
  );

  server.registerTool(
    "jira_create_filter",
    {
      title: "Create Filter",
      description: "Create a new saved filter.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        name: z.string().min(1).describe("Filter name"),
        jql: z.string().min(1).describe("JQL query"),
        description: z.string().optional().describe("Filter description"),
        favourite: z.boolean().optional().describe("Mark as favourite"),
      }),
    },
    withClient(async (client, _auth, { name, jql, description, favourite }) => {
      const response = await client.post("/rest/api/3/filter", { name, jql, description, favourite });
      return {
        success: true, id: response.data?.id, name: response.data?.name,
        jql: response.data?.jql, message: `Filter "${name}" created successfully`,
      };
    })
  );

  server.registerTool(
    "jira_update_filter",
    {
      title: "Update Filter",
      description: "Update an existing filter.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        filterId: z.string().min(1).describe("Filter ID"),
        name: z.string().optional().describe("New filter name"),
        jql: z.string().optional().describe("New JQL query"),
        description: z.string().optional().describe("New description"),
        favourite: z.boolean().optional().describe("Favourite status"),
      }),
    },
    withClient(async (client, _auth, { filterId, name, jql, description, favourite }) => {
      const payload: Record<string, unknown> = {};
      if (name !== undefined) payload.name = name;
      if (jql !== undefined) payload.jql = jql;
      if (description !== undefined) payload.description = description;
      if (favourite !== undefined) payload.favourite = favourite;

      if (Object.keys(payload).length === 0) {
        return { error: "no_changes", message: "No fields provided to update" };
      }

      const response = await client.put(`/rest/api/3/filter/${filterId}`, payload);
      return {
        success: true, id: response.data?.id ?? filterId,
        name: response.data?.name, message: `Filter updated successfully`,
      };
    })
  );

  server.registerTool(
    "jira_get_my_filters",
    {
      title: "Get My Filters",
      description: "Get filters owned by the current user.",
      annotations: READ_ONLY,
      inputSchema: z.object({ expand: z.string().optional().describe("Expand options") }),
    },
    withClient(async (client, _auth, { expand }) => {
      const response = await client.get("/rest/api/3/filter/my", { params: { expand } });
      return (response.data || []).map((f: any) => ({
        id: f.id, name: f.name, description: f.description,
        jql: f.jql, favourite: f.favourite ?? false,
      }));
    })
  );

  server.registerTool(
    "jira_get_favourite_filters",
    {
      title: "Get Favourite Filters",
      description: "Get filters marked as favourite by the current user.",
      annotations: READ_ONLY,
      inputSchema: z.object({ expand: z.string().optional().describe("Expand options") }),
    },
    withClient(async (client, _auth, { expand }) => {
      const response = await client.get("/rest/api/3/filter/favourite", { params: { expand } });
      return (response.data || []).map((f: any) => ({
        id: f.id, name: f.name, description: f.description,
        owner: f.owner?.displayName, jql: f.jql,
      }));
    })
  );

  // ============ Dashboards ============

  server.registerTool(
    "jira_get_dashboards",
    {
      title: "Get Dashboards",
      description: "Get a list of dashboards. Can filter by favourite or owned dashboards.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        filter: z.enum(["favourite", "my"]).optional().describe("Filter dashboards: 'favourite' for favourited, 'my' for owned"),
        startAt: z.number().optional().default(0).describe("Index of first result"),
        maxResults: z.number().optional().default(50).describe("Maximum results to return"),
      }),
    },
    withClient(async (client, _auth, { filter, startAt, maxResults }) => {
      const response = await client.get("/rest/api/3/dashboard", {
        params: { filter, startAt, maxResults },
      });
      return {
        total: response.data.total, startAt: response.data.startAt,
        maxResults: response.data.maxResults,
        dashboards: (response.data.dashboards || []).map((d: any) => ({
          id: d.id, name: d.name, self: d.self, isFavourite: d.isFavourite, view: d.view,
        })),
      };
    })
  );

  server.registerTool(
    "jira_search_dashboards",
    {
      title: "Search Dashboards",
      description: "Search for dashboards by name, owner, or other criteria.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        dashboardName: z.string().optional().describe("Filter by dashboard name (case insensitive contains)"),
        accountId: z.string().optional().describe("Filter by owner account ID"),
        groupname: z.string().optional().describe("Filter by group permission"),
        orderBy: z.enum(["name", "-name", "id", "-id", "owner", "-owner", "favourite_count", "-favourite_count"]).optional().describe("Order results by field (prefix with - for descending)"),
        startAt: z.number().optional().default(0).describe("Index of first result"),
        maxResults: z.number().optional().default(50).describe("Maximum results"),
        expand: z.string().optional().describe("Expand options: description, owner, viewUrl, favourite, favouritedCount, sharePermissions, editPermissions"),
      }),
    },
    withClient(async (client, _auth, { dashboardName, accountId, groupname, orderBy, startAt, maxResults, expand }) => {
      const response = await client.get("/rest/api/3/dashboard/search", {
        params: { dashboardName, accountId, groupname, orderBy, startAt, maxResults, expand },
      });
      return {
        total: response.data.total, startAt: response.data.startAt,
        maxResults: response.data.maxResults,
        dashboards: (response.data.values || []).map((d: any) => ({
          id: d.id, name: d.name, description: d.description,
          owner: d.owner ? { accountId: d.owner.accountId, displayName: d.owner.displayName } : undefined,
          isFavourite: d.isFavourite, popularity: d.popularity, view: d.view,
        })),
      };
    })
  );

  server.registerTool(
    "jira_get_dashboard",
    {
      title: "Get Dashboard",
      description: "Get details of a specific dashboard by ID.",
      annotations: READ_ONLY,
      inputSchema: z.object({ id: z.string().describe("Dashboard ID") }),
    },
    withClient(async (client, _auth, { id }) => {
      const response = await client.get(`/rest/api/3/dashboard/${id}`);
      const d = response.data;
      return {
        id: d.id, name: d.name, description: d.description, self: d.self,
        isFavourite: d.isFavourite,
        owner: d.owner ? { accountId: d.owner.accountId, displayName: d.owner.displayName } : undefined,
        popularity: d.popularity, view: d.view,
        editPermissions: d.editPermissions, sharePermissions: d.sharePermissions,
      };
    })
  );

  server.registerTool(
    "jira_get_dashboard_gadgets",
    {
      title: "Get Dashboard Gadgets",
      description: "Get all gadgets on a dashboard.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        dashboardId: z.string().describe("Dashboard ID"),
        moduleKey: z.array(z.string()).optional().describe("Filter by gadget module keys"),
        uri: z.string().optional().describe("Filter by gadget URI"),
        gadgetId: z.array(z.string()).optional().describe("Filter by gadget IDs"),
      }),
    },
    withClient(async (client, _auth, { dashboardId, moduleKey, uri, gadgetId }) => {
      const response = await client.get(`/rest/api/3/dashboard/${dashboardId}/gadget`, {
        params: { moduleKey: moduleKey?.join(","), uri, gadgetId: gadgetId?.join(",") },
      });
      return {
        gadgets: (response.data.gadgets || []).map((g: any) => ({
          id: g.id, moduleKey: g.moduleKey, uri: g.uri,
          color: g.color, position: g.position, title: g.title,
        })),
      };
    })
  );

  server.registerTool(
    "jira_add_dashboard_gadget",
    {
      title: "Add Dashboard Gadget",
      description: "Add a gadget to a dashboard. Provide either moduleKey or uri to specify the gadget type.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        dashboardId: z.string().describe("Dashboard ID"),
        moduleKey: z.string().optional().describe("Module key of the gadget type (e.g., com.atlassian.jira.gadgets:filter-results-gadget)"),
        uri: z.string().optional().describe("URI of the gadget type"),
        color: z.enum(["blue", "red", "yellow", "green", "cyan", "purple", "gray", "white"]).optional().describe("Gadget colour"),
        position: z.object({
          row: z.number().describe("Row position (0-indexed)"),
          column: z.number().describe("Column position (0-indexed)"),
        }).optional().describe("Position on dashboard grid"),
        title: z.string().optional().describe("Gadget title"),
        ignoreUriAndModuleKeyValidation: z.boolean().optional().default(false).describe("Skip validation of moduleKey/uri"),
      }),
    },
    withClient(async (client, _auth, { dashboardId, moduleKey, uri, color, position, title, ignoreUriAndModuleKeyValidation }) => {
      if (!moduleKey && !uri) {
        return { error: true, message: "Either moduleKey or uri must be provided" };
      }
      const response = await client.post(`/rest/api/3/dashboard/${dashboardId}/gadget`, {
        moduleKey, uri, color, position, title, ignoreUriAndModuleKeyValidation,
      });
      return {
        success: true,
        gadget: {
          id: response.data.id, moduleKey: response.data.moduleKey,
          uri: response.data.uri, color: response.data.color,
          position: response.data.position, title: response.data.title,
        },
      };
    })
  );
}
