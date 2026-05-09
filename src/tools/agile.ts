import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { READ_ONLY, WRITE_CREATE, WRITE_IDEMPOTENT } from "../annotations.js";

export function registerAgileTools(server: McpServer): void {
  server.registerTool(
    "jira_get_boards",
    {
      title: "Get Jira Boards",
      description:
        "Get all Scrum and Kanban boards, optionally filtered by project or type.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        projectKeyOrId: z.string().optional().describe("Filter boards by project"),
        type: z.enum(["scrum", "kanban", "simple"]).optional().describe("Filter by board type"),
        name: z.string().optional().describe("Filter boards by name (contains)"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional().default(50),
      }),
    },
    withClient(async (client, _auth, { projectKeyOrId, type, name, startAt, maxResults }) => {
      const response = await client.get("/rest/agile/1.0/board", {
        params: { projectKeyOrId, type, name, startAt, maxResults: maxResults ?? 50 },
      });
      const boards = Array.isArray(response.data?.values)
        ? response.data.values.map((b: any) => ({
            id: b.id, name: b.name, type: b.type,
            projectKey: b.location?.projectKey, projectName: b.location?.displayName,
          }))
        : [];
      return { total: response.data?.total ?? boards.length, startAt: response.data?.startAt ?? 0, boards };
    })
  );

  server.registerTool(
    "jira_get_board",
    {
      title: "Get Board Details",
      description: "Get details of a specific board including configuration.",
      annotations: READ_ONLY,
      inputSchema: z.object({ boardId: z.number().int().positive().describe("Board ID") }),
    },
    withClient(async (client, _auth, { boardId }) => {
      const response = await client.get(`/rest/agile/1.0/board/${boardId}`);
      return {
        id: response.data?.id, name: response.data?.name, type: response.data?.type,
        self: response.data?.self, location: response.data?.location,
      };
    })
  );

  server.registerTool(
    "jira_get_board_configuration",
    {
      title: "Get Board Configuration",
      description: "Get the configuration of a board including columns, estimation, and ranking.",
      annotations: READ_ONLY,
      inputSchema: z.object({ boardId: z.number().int().positive().describe("Board ID") }),
    },
    withClient(async (client, _auth, { boardId }) => {
      const response = await client.get(`/rest/agile/1.0/board/${boardId}/configuration`);
      return {
        id: response.data?.id, name: response.data?.name, type: response.data?.type,
        filter: response.data?.filter, columnConfig: response.data?.columnConfig,
        estimation: response.data?.estimation, ranking: response.data?.ranking,
      };
    })
  );

  server.registerTool(
    "jira_get_sprints",
    {
      title: "Get Sprints",
      description: "Get sprints for a board, optionally filtered by state.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
        state: z.enum(["future", "active", "closed"]).optional().describe("Filter by sprint state"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional().default(50),
      }),
    },
    withClient(async (client, _auth, { boardId, state, startAt, maxResults }) => {
      const response = await client.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
        params: { state, startAt, maxResults: maxResults ?? 50 },
      });
      const sprints = Array.isArray(response.data?.values)
        ? response.data.values.map((s: any) => ({
            id: s.id, name: s.name, state: s.state,
            startDate: s.startDate, endDate: s.endDate, completeDate: s.completeDate,
            originBoardId: s.originBoardId, goal: s.goal,
          }))
        : [];
      return { total: response.data?.total ?? sprints.length, startAt: response.data?.startAt ?? 0, sprints };
    })
  );

  server.registerTool(
    "jira_get_sprint",
    {
      title: "Get Sprint Details",
      description: "Get details of a specific sprint.",
      annotations: READ_ONLY,
      inputSchema: z.object({ sprintId: z.number().int().positive().describe("Sprint ID") }),
    },
    withClient(async (client, _auth, { sprintId }) => {
      const response = await client.get(`/rest/agile/1.0/sprint/${sprintId}`);
      return {
        id: response.data?.id, name: response.data?.name, state: response.data?.state,
        startDate: response.data?.startDate, endDate: response.data?.endDate,
        completeDate: response.data?.completeDate, originBoardId: response.data?.originBoardId,
        goal: response.data?.goal,
      };
    })
  );

  server.registerTool(
    "jira_create_sprint",
    {
      title: "Create Sprint",
      description: "Create a new sprint on a board.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
        name: z.string().min(1).describe("Sprint name"),
        startDate: z.string().optional().describe("Start date (ISO 8601)"),
        endDate: z.string().optional().describe("End date (ISO 8601)"),
        goal: z.string().optional().describe("Sprint goal"),
      }),
    },
    withClient(async (client, _auth, { boardId, name, startDate, endDate, goal }) => {
      const response = await client.post("/rest/agile/1.0/sprint", {
        originBoardId: boardId, name, startDate, endDate, goal,
      });
      return {
        success: true, id: response.data?.id, name: response.data?.name,
        state: response.data?.state, message: `Sprint "${name}" created successfully`,
      };
    })
  );

  server.registerTool(
    "jira_update_sprint",
    {
      title: "Update Sprint",
      description: "Update sprint details including name, dates, and goal.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID"),
        name: z.string().optional().describe("New sprint name"),
        state: z.enum(["future", "active", "closed"]).optional().describe("Sprint state"),
        startDate: z.string().optional().describe("Start date (ISO 8601)"),
        endDate: z.string().optional().describe("End date (ISO 8601)"),
        goal: z.string().optional().describe("Sprint goal"),
      }),
    },
    withClient(async (client, _auth, { sprintId, name, state, startDate, endDate, goal }) => {
      const payload: Record<string, unknown> = {};
      if (name !== undefined) payload.name = name;
      if (state !== undefined) payload.state = state;
      if (startDate !== undefined) payload.startDate = startDate;
      if (endDate !== undefined) payload.endDate = endDate;
      if (goal !== undefined) payload.goal = goal;

      if (Object.keys(payload).length === 0) {
        return { error: "no_changes", message: "No fields provided to update" };
      }

      const response = await client.put(`/rest/agile/1.0/sprint/${sprintId}`, payload);
      return {
        success: true, id: response.data?.id ?? sprintId,
        name: response.data?.name, state: response.data?.state,
        message: `Sprint updated successfully`,
      };
    })
  );

  server.registerTool(
    "jira_start_sprint",
    {
      title: "Start Sprint",
      description: "Start a sprint that is in 'future' state.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID"),
        startDate: z.string().optional().describe("Start date (defaults to now)"),
        endDate: z.string().describe("End date (required for starting a sprint)"),
      }),
    },
    withClient(async (client, _auth, { sprintId, startDate, endDate }) => {
      const response = await client.post(`/rest/agile/1.0/sprint/${sprintId}`, {
        state: "active", startDate: startDate || new Date().toISOString(), endDate,
      });
      return {
        success: true, id: response.data?.id ?? sprintId,
        state: "active", message: `Sprint started successfully`,
      };
    })
  );

  server.registerTool(
    "jira_complete_sprint",
    {
      title: "Complete Sprint",
      description: "Complete an active sprint. Optionally move incomplete issues to another sprint or backlog.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID to complete"),
        moveIncompleteIssuesTo: z.number().int().positive().optional().describe("Sprint ID to move incomplete issues to (omit to move to backlog)"),
      }),
    },
    withClient(async (client, _auth, { sprintId, moveIncompleteIssuesTo }) => {
      await client.post(`/rest/agile/1.0/sprint/${sprintId}`, { state: "closed" });
      return {
        success: true, id: sprintId, state: "closed",
        message: `Sprint completed successfully`,
        incompleteIssuesMovedTo: moveIncompleteIssuesTo || "backlog",
      };
    })
  );

  server.registerTool(
    "jira_get_sprint_issues",
    {
      title: "Get Sprint Issues",
      description: "Get all issues in a sprint.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID"),
        jql: z.string().optional().describe("Additional JQL filter"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional().default(50),
      }),
    },
    withClient(async (client, _auth, { sprintId, jql, fields, startAt, maxResults }) => {
      const response = await client.get(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
        params: { jql, fields: fields?.join(","), startAt, maxResults: maxResults ?? 50 },
      });
      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map((issue: any) => ({
            key: issue.key, summary: issue.fields?.summary,
            status: issue.fields?.status?.name, assignee: issue.fields?.assignee?.displayName,
            issueType: issue.fields?.issuetype?.name, priority: issue.fields?.priority?.name,
            storyPoints: issue.fields?.customfield_10016,
          }))
        : [];
      return { total: response.data?.total ?? issues.length, startAt: response.data?.startAt ?? 0, sprintId, issues };
    })
  );

  server.registerTool(
    "jira_move_issues_to_sprint",
    {
      title: "Move Issues to Sprint",
      description: "Move issues to a sprint.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Target sprint ID"),
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move"),
      }),
    },
    withClient(async (client, _auth, { sprintId, issueKeys }) => {
      await client.post(`/rest/agile/1.0/sprint/${sprintId}/issue`, { issues: issueKeys });
      return {
        success: true, sprintId, issuesMoved: issueKeys,
        message: `${issueKeys.length} issue(s) moved to sprint ${sprintId}`,
      };
    })
  );

  server.registerTool(
    "jira_get_backlog_issues",
    {
      title: "Get Backlog Issues",
      description: "Get issues in the backlog (not in any active sprint) for a board.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
        jql: z.string().optional().describe("Additional JQL filter"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional().default(50),
      }),
    },
    withClient(async (client, _auth, { boardId, jql, fields, startAt, maxResults }) => {
      const response = await client.get(`/rest/agile/1.0/board/${boardId}/backlog`, {
        params: { jql, fields: fields?.join(","), startAt, maxResults: maxResults ?? 50 },
      });
      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map((issue: any) => ({
            key: issue.key, summary: issue.fields?.summary,
            status: issue.fields?.status?.name, assignee: issue.fields?.assignee?.displayName,
            issueType: issue.fields?.issuetype?.name, priority: issue.fields?.priority?.name,
          }))
        : [];
      return { total: response.data?.total ?? issues.length, startAt: response.data?.startAt ?? 0, boardId, issues };
    })
  );

  server.registerTool(
    "jira_move_issues_to_backlog",
    {
      title: "Move Issues to Backlog",
      description: "Move issues from a sprint back to the backlog.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move to backlog"),
      }),
    },
    withClient(async (client, _auth, { issueKeys }) => {
      await client.post("/rest/agile/1.0/backlog/issue", { issues: issueKeys });
      return {
        success: true, issuesMoved: issueKeys,
        message: `${issueKeys.length} issue(s) moved to backlog`,
      };
    })
  );

  server.registerTool(
    "jira_rank_issues",
    {
      title: "Rank Issues",
      description: "Change the rank of issues on a board by placing them before or after another issue.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to rank"),
        rankBeforeIssue: z.string().optional().describe("Issue key to rank before"),
        rankAfterIssue: z.string().optional().describe("Issue key to rank after"),
      }),
    },
    withClient(async (client, _auth, { issueKeys, rankBeforeIssue, rankAfterIssue }) => {
      if (!rankBeforeIssue && !rankAfterIssue) {
        return { error: "invalid_parameters", message: "Either rankBeforeIssue or rankAfterIssue must be provided" };
      }

      const payload: Record<string, unknown> = { issues: issueKeys };
      if (rankBeforeIssue) {
        payload.rankBeforeIssue = rankBeforeIssue;
      } else if (rankAfterIssue) {
        payload.rankAfterIssue = rankAfterIssue;
      }

      await client.put("/rest/agile/1.0/issue/rank", payload);
      return {
        success: true, issuesRanked: issueKeys,
        message: `${issueKeys.length} issue(s) ranked successfully`,
      };
    })
  );
}
