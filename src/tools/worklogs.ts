import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { textToAdf, normalizeFieldText } from "../utils.js";
import { READ_ONLY, WRITE_CREATE } from "../annotations.js";

export function registerWorklogTools(server: McpServer): void {
  server.registerTool(
    "jira_add_worklog",
    {
      title: "Add Work Log",
      description:
        "Use when the user wants to log time/work on a specific Jira ticket. Allows specifying time spent, start date/time, and an optional description.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("The issue key (e.g., PROJ-123) to log work against"),
        timeSpent: z.string().min(1).describe("Time spent in Jira format (e.g., '1h', '30m', '1h 30m', '1d')"),
        started: z.string().optional().describe("When the work started in ISO 8601 format (e.g., '2026-02-13T14:00:00.000+0000'). Defaults to now if not provided."),
        comment: z.string().optional().describe("Optional description of the work performed"),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, timeSpent, started, comment }) => {
      const worklogData: Record<string, unknown> = { timeSpent };
      if (started) worklogData.started = started;
      if (comment) worklogData.comment = textToAdf(comment);

      const response = await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog`,
        worklogData
      );

      return {
        id: response.data?.id ?? "",
        issueId: response.data?.issueId ?? "",
        timeSpent: response.data?.timeSpent ?? "",
        started: response.data?.started ?? "",
        author: response.data?.author?.displayName ?? response.data?.author?.emailAddress ?? "",
        created: response.data?.created ?? "",
      };
    })
  );

  server.registerTool(
    "jira_get_issue_worklogs",
    {
      title: "Get Issue Work Logs",
      description:
        "Get work logs recorded on a SPECIFIC Jira issue/ticket. " +
        "Use when the user mentions a specific issue key like PROJ-123 and wants to see time logged on it. " +
        "Examples: 'show worklogs on PROJ-123', 'how much time logged on ABC-456', 'who worked on this ticket'. " +
        "Do NOT use for user timesheet reports - use jira_get_user_worklogs instead.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("The issue key (e.g., PROJ-123) to get work logs for"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional(),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, startAt, maxResults }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog`,
        { params: { startAt, maxResults } }
      );

      const worklogs = Array.isArray(response.data?.worklogs)
        ? response.data.worklogs.map((worklog: any) => ({
            id: worklog?.id ?? "",
            author: worklog?.author?.displayName || worklog?.author?.emailAddress || "",
            timeSpent: worklog?.timeSpent ?? "",
            timeSpentSeconds: worklog?.timeSpentSeconds ?? 0,
            started: worklog?.started ?? "",
            created: worklog?.created ?? "",
            comment: normalizeFieldText(worklog?.comment),
          }))
        : [];

      return { total: response.data?.total ?? worklogs.length, worklogs };
    })
  );

  server.registerTool(
    "jira_get_updated_worklog_ids",
    {
      title: "Get Updated Worklog IDs",
      description:
        "Get IDs of worklogs that were created or updated since a specific date/time. Use this to discover worklogs for reporting purposes.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        since: z.string().describe("Get worklogs updated since this date. Can be ISO 8601 format (e.g., '2026-01-15T00:00:00.000Z') or Unix timestamp in milliseconds."),
        expand: z.string().optional().describe("Expand options for additional worklog properties"),
      }),
    },
    withClient(async (client, _auth, { since, expand }) => {
      let sinceTimestamp: number;
      if (/^\d+$/.test(since)) {
        sinceTimestamp = parseInt(since, 10);
      } else {
        sinceTimestamp = new Date(since).getTime();
      }

      const params: Record<string, unknown> = { since: sinceTimestamp };
      if (expand) params.expand = expand;

      const response = await client.get("/rest/api/3/worklog/updated", { params });

      return {
        since: sinceTimestamp,
        sinceDate: new Date(sinceTimestamp).toISOString(),
        until: response.data.until,
        untilDate: response.data.until ? new Date(response.data.until).toISOString() : null,
        lastPage: response.data.lastPage,
        nextPage: response.data.nextPage,
        worklogIds: (response.data.values || []).map((v: any) => ({
          worklogId: v.worklogId,
          updatedTime: v.updatedTime,
          updatedDate: new Date(v.updatedTime).toISOString(),
        })),
        total: response.data.values?.length || 0,
      };
    })
  );

  server.registerTool(
    "jira_get_worklogs_by_ids",
    {
      title: "Get Worklogs by IDs",
      description:
        "Get full worklog details for a list of worklog IDs. Use after getting IDs from jira_get_updated_worklog_ids.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        ids: z.array(z.number().int().positive()).min(1).max(1000).describe("Array of worklog IDs to fetch (max 1000)"),
        expand: z.string().optional().describe("Expand options"),
      }),
    },
    withClient(async (client, _auth, { ids, expand }) => {
      const params: Record<string, unknown> = {};
      if (expand) params.expand = expand;

      const response = await client.post("/rest/api/3/worklog/list", { ids }, { params });

      const worklogs = Array.isArray(response.data)
        ? response.data.map((worklog: any) => ({
            id: worklog.id, issueId: worklog.issueId,
            author: {
              accountId: worklog.author?.accountId,
              displayName: worklog.author?.displayName,
              emailAddress: worklog.author?.emailAddress,
            },
            updateAuthor: {
              accountId: worklog.updateAuthor?.accountId,
              displayName: worklog.updateAuthor?.displayName,
            },
            timeSpent: worklog.timeSpent,
            timeSpentSeconds: worklog.timeSpentSeconds,
            started: worklog.started, created: worklog.created, updated: worklog.updated,
            comment: normalizeFieldText(worklog.comment),
          }))
        : [];

      return { worklogs, total: worklogs.length };
    })
  );

  server.registerTool(
    "jira_get_user_worklogs",
    {
      title: "Get User Worklogs (Timesheet)",
      description:
        "Get a USER's time tracking report across ALL issues within a date range. " +
        "Use for timesheet reports, weekly/monthly summaries, or 'how much did X log this week'. " +
        "Examples: 'show my worklogs this week', 'how much time did John log in January', 'my timesheet for last 7 days'. " +
        "Do NOT use for worklogs on a specific issue - use jira_get_issue_worklogs instead.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        accountId: z.string().optional().describe("User account ID to filter worklogs for. If not provided, returns worklogs for the current user."),
        since: z.string().describe("Start date for the report. ISO 8601 format (e.g., '2026-01-15') or relative like '30 days ago' will be parsed."),
        until: z.string().optional().describe("End date for the report. Defaults to now if not provided."),
        includeIssueDetails: z.boolean().optional().default(false).describe("Whether to fetch issue details (key, summary) for each worklog"),
      }),
    },
    withClient(async (client, _auth, { accountId, since, until, includeIssueDetails }) => {
      // Get current user if no accountId provided
      let targetAccountId = accountId;
      let targetUserName = "";
      if (!targetAccountId) {
        const meResponse = await client.get("/rest/api/3/myself");
        targetAccountId = meResponse.data.accountId;
        targetUserName = meResponse.data.displayName || meResponse.data.emailAddress;
      }

      // Parse since date
      let sinceTimestamp: number;
      const sinceMatch = since.match(/^(\d+)\s*(days?|weeks?|months?)\s*ago$/i);
      if (sinceMatch && sinceMatch[1] && sinceMatch[2]) {
        const amount = parseInt(sinceMatch[1], 10);
        const unit = sinceMatch[2].toLowerCase();
        const now = new Date();
        if (unit.startsWith("day")) {
          now.setDate(now.getDate() - amount);
        } else if (unit.startsWith("week")) {
          now.setDate(now.getDate() - amount * 7);
        } else if (unit.startsWith("month")) {
          now.setMonth(now.getMonth() - amount);
        }
        sinceTimestamp = now.getTime();
      } else {
        sinceTimestamp = new Date(since).getTime();
      }

      // Parse until date
      let untilTimestamp: number | undefined;
      if (until) {
        untilTimestamp = new Date(until).getTime();
      }

      // Fetch all updated worklog IDs since the date (paginated)
      const allWorklogIds: Array<number> = [];
      let nextPageUrl: string | undefined = `/rest/api/3/worklog/updated?since=${sinceTimestamp}`;
      let pageCount = 0;
      const maxPages = 10;

      while (nextPageUrl && pageCount < maxPages) {
        const pageResponse: { data: { values?: Array<{ worklogId: number; updatedTime: number }>; lastPage?: boolean; nextPage?: string } } = await client.get(nextPageUrl);
        const values = pageResponse.data.values || [];
        
        for (const v of values) {
          if (untilTimestamp && v.updatedTime > untilTimestamp) {
            continue;
          }
          allWorklogIds.push(v.worklogId);
        }

        if (pageResponse.data.lastPage) {
          break;
        }
        nextPageUrl = pageResponse.data.nextPage;
        pageCount++;
      }

      if (allWorklogIds.length === 0) {
        return {
          user: targetUserName || targetAccountId,
          accountId: targetAccountId,
          period: {
            since: new Date(sinceTimestamp).toISOString(),
            until: untilTimestamp ? new Date(untilTimestamp).toISOString() : new Date().toISOString(),
          },
          worklogs: [],
          summary: { totalWorklogs: 0, totalTimeSpentSeconds: 0, totalTimeSpent: "0h" },
        };
      }

      // Fetch worklog details in batches of 1000
      const allWorklogs: Array<any> = [];
      for (let i = 0; i < allWorklogIds.length; i += 1000) {
        const batchIds = allWorklogIds.slice(i, i + 1000);
        const response = await client.post("/rest/api/3/worklog/list", { ids: batchIds });
        if (Array.isArray(response.data)) {
          allWorklogs.push(...response.data);
        }
      }

      // Filter worklogs by user
      const userWorklogs = allWorklogs.filter(
        (w: any) => w.author?.accountId === targetAccountId
      );

      // Optionally fetch issue details
      const issueCache: Record<string, { key: string; summary: string }> = {};
      if (includeIssueDetails && userWorklogs.length > 0) {
        const uniqueIssueIds = [...new Set(userWorklogs.map((w: any) => w.issueId))];
        for (let i = 0; i < uniqueIssueIds.length; i += 50) {
          const batchIds = uniqueIssueIds.slice(i, i + 50);
          try {
            const issueResponse = await client.get("/rest/api/3/search", {
              params: {
                jql: `id in (${batchIds.join(",")})`,
                fields: "summary",
                maxResults: 50,
              },
            });
            for (const issue of issueResponse.data.issues || []) {
              issueCache[issue.id] = {
                key: issue.key,
                summary: issue.fields?.summary || "",
              };
            }
          } catch {
            // Continue even if some issues can't be fetched
          }
        }
      }

      // Format worklogs
      const formattedWorklogs = userWorklogs.map((w: any) => {
        const result: Record<string, unknown> = {
          id: w.id, issueId: w.issueId,
          timeSpent: w.timeSpent, timeSpentSeconds: w.timeSpentSeconds,
          started: w.started, created: w.created,
          comment: normalizeFieldText(w.comment),
        };
        const cachedIssue = issueCache[w.issueId];
        if (includeIssueDetails && cachedIssue) {
          result.issueKey = cachedIssue.key;
          result.issueSummary = cachedIssue.summary;
        }
        return result;
      });

      // Sort by started date
      formattedWorklogs.sort((a: any, b: any) => 
        new Date(a.started).getTime() - new Date(b.started).getTime()
      );

      // Calculate summary
      const totalSeconds = userWorklogs.reduce(
        (sum: number, w: any) => sum + (w.timeSpentSeconds || 0), 0
      );
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const totalTimeSpent = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;

      // Group by issue if details included
      let byIssue: Record<string, { key: string; summary: string; totalSeconds: number; totalTime: string }> | undefined;
      if (includeIssueDetails) {
        byIssue = {};
        for (const w of formattedWorklogs) {
          const issueId = w.issueId as string;
          if (!byIssue[issueId]) {
            byIssue[issueId] = {
              key: (w.issueKey as string) || issueId,
              summary: (w.issueSummary as string) || "",
              totalSeconds: 0,
              totalTime: "",
            };
          }
          byIssue[issueId].totalSeconds += (w.timeSpentSeconds as number) || 0;
        }
        for (const issueId of Object.keys(byIssue)) {
          const issueEntry = byIssue[issueId];
          if (issueEntry) {
            const secs = issueEntry.totalSeconds;
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            issueEntry.totalTime = m > 0 ? `${h}h ${m}m` : `${h}h`;
          }
        }
      }

      return {
        user: targetUserName || targetAccountId,
        accountId: targetAccountId,
        period: {
          since: new Date(sinceTimestamp).toISOString(),
          until: untilTimestamp ? new Date(untilTimestamp).toISOString() : new Date().toISOString(),
        },
        worklogs: formattedWorklogs,
        summary: {
          totalWorklogs: formattedWorklogs.length,
          totalTimeSpentSeconds: totalSeconds,
          totalTimeSpent,
          ...(byIssue && { byIssue: Object.values(byIssue) }),
        },
      };
    })
  );

  server.registerTool(
    "jira_get_deleted_worklog_ids",
    {
      title: "Get Deleted Worklog IDs",
      description:
        "Get IDs of worklogs that were deleted since a specific date/time. Useful for audit and sync purposes.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        since: z.string().describe("Get worklogs deleted since this date. ISO 8601 format or Unix timestamp in milliseconds."),
      }),
    },
    withClient(async (client, _auth, { since }) => {
      let sinceTimestamp: number;
      if (/^\d+$/.test(since)) {
        sinceTimestamp = parseInt(since, 10);
      } else {
        sinceTimestamp = new Date(since).getTime();
      }

      const response = await client.get("/rest/api/3/worklog/deleted", {
        params: { since: sinceTimestamp },
      });

      return {
        since: sinceTimestamp,
        sinceDate: new Date(sinceTimestamp).toISOString(),
        until: response.data.until,
        lastPage: response.data.lastPage,
        nextPage: response.data.nextPage,
        deletedWorklogIds: (response.data.values || []).map((v: any) => ({
          worklogId: v.worklogId,
          updatedTime: v.updatedTime,
        })),
        total: response.data.values?.length || 0,
      };
    })
  );
}
