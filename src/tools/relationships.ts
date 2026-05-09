import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { textToAdf } from "../utils.js";
import { READ_ONLY, WRITE_CREATE, WRITE_IDEMPOTENT, DESTRUCTIVE } from "../annotations.js";

export function registerRelationshipTools(server: McpServer): void {
  server.registerTool(
    "jira_get_issue_links",
    {
      title: "Get Issue Links",
      description: "Get all linked issues for a specific issue.",
      annotations: READ_ONLY,
      inputSchema: z.object({ issueIdOrKey: z.string().min(1).describe("Issue key or ID") }),
    },
    withClient(async (client, _auth, { issueIdOrKey }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`,
        { params: { fields: "issuelinks" } }
      );
      const links = Array.isArray(response.data?.fields?.issuelinks)
        ? response.data.fields.issuelinks.map((link: any) => {
            const isInward = !!link.inwardIssue;
            const linkedIssue = isInward ? link.inwardIssue : link.outwardIssue;
            return {
              id: link.id,
              type: link.type?.name,
              direction: isInward ? "inward" : "outward",
              description: isInward ? link.type?.inward : link.type?.outward,
              linkedIssue: {
                key: linkedIssue?.key,
                summary: linkedIssue?.fields?.summary,
                status: linkedIssue?.fields?.status?.name,
                issueType: linkedIssue?.fields?.issuetype?.name,
              },
            };
          })
        : [];
      return { issueKey: issueIdOrKey, links };
    })
  );

  server.registerTool(
    "jira_create_issue_link",
    {
      title: "Link Issues",
      description: "Create a link between two issues.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        inwardIssue: z.string().min(1).describe("Inward issue key (the 'from' issue)"),
        outwardIssue: z.string().min(1).describe("Outward issue key (the 'to' issue)"),
        linkType: z.string().min(1).describe("Link type name (e.g., 'Blocks', 'Relates', 'Duplicates')"),
        comment: z.string().optional().describe("Comment to add with the link"),
      }),
    },
    withClient(async (client, _auth, { inwardIssue, outwardIssue, linkType, comment }) => {
      const payload: Record<string, unknown> = {
        type: { name: linkType },
        inwardIssue: { key: inwardIssue },
        outwardIssue: { key: outwardIssue },
      };
      if (comment) {
        payload.comment = { body: textToAdf(comment) };
      }
      await client.post("/rest/api/3/issueLink", payload);
      return {
        success: true,
        message: `Link created: ${inwardIssue} ${linkType} ${outwardIssue}`,
        inwardIssue, outwardIssue, linkType,
      };
    })
  );

  server.registerTool(
    "jira_get_link_types",
    {
      title: "Get Issue Link Types",
      description: "Get available link types for linking issues.",
      annotations: READ_ONLY,
      inputSchema: z.object({}),
    },
    withClient(async (client) => {
      const response = await client.get("/rest/api/3/issueLinkType");
      return (response.data?.issueLinkTypes || []).map((lt: any) => ({
        id: lt.id, name: lt.name, inward: lt.inward, outward: lt.outward,
      }));
    })
  );

  server.registerTool(
    "jira_get_watchers",
    {
      title: "Get Issue Watchers",
      description: "Get the list of users watching an issue.",
      annotations: READ_ONLY,
      inputSchema: z.object({ issueIdOrKey: z.string().min(1).describe("Issue key or ID") }),
    },
    withClient(async (client, _auth, { issueIdOrKey }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`
      );
      const watchers = Array.isArray(response.data?.watchers)
        ? response.data.watchers.map((w: any) => ({
            accountId: w.accountId, displayName: w.displayName, emailAddress: w.emailAddress,
          }))
        : [];
      return {
        issueKey: issueIdOrKey,
        watchCount: response.data?.watchCount ?? watchers.length,
        isWatching: response.data?.isWatching ?? false,
        watchers,
      };
    })
  );

  server.registerTool(
    "jira_add_watcher",
    {
      title: "Add Issue Watcher",
      description: "Add a user to watch an issue.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        accountId: z.string().min(1).describe("User account ID to add as watcher"),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, accountId }) => {
      await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`,
        JSON.stringify(accountId),
        { headers: { "Content-Type": "application/json" } }
      );
      return { success: true, issueKey: issueIdOrKey, accountId, message: `User added as watcher` };
    })
  );

  server.registerTool(
    "jira_remove_watcher",
    {
      title: "Remove Issue Watcher",
      description: "Remove a user from watching an issue.",
      annotations: DESTRUCTIVE,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        accountId: z.string().min(1).describe("User account ID to remove"),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, accountId }) => {
      await client.delete(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`,
        { params: { accountId } }
      );
      return { success: true, issueKey: issueIdOrKey, accountId, message: `User removed from watchers` };
    })
  );

  server.registerTool(
    "jira_get_votes",
    {
      title: "Get Issue Votes",
      description: "Get the vote count and voters for an issue.",
      annotations: READ_ONLY,
      inputSchema: z.object({ issueIdOrKey: z.string().min(1).describe("Issue key or ID") }),
    },
    withClient(async (client, _auth, { issueIdOrKey }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`
      );
      const voters = Array.isArray(response.data?.voters)
        ? response.data.voters.map((v: any) => ({ accountId: v.accountId, displayName: v.displayName }))
        : [];
      return {
        issueKey: issueIdOrKey,
        votes: response.data?.votes ?? 0,
        hasVoted: response.data?.hasVoted ?? false,
        voters,
      };
    })
  );

  server.registerTool(
    "jira_add_vote",
    {
      title: "Vote for Issue",
      description: "Add your vote to an issue.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({ issueIdOrKey: z.string().min(1).describe("Issue key or ID") }),
    },
    withClient(async (client, _auth, { issueIdOrKey }) => {
      await client.post(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`);
      return { success: true, issueKey: issueIdOrKey, message: `Vote added successfully` };
    })
  );

  server.registerTool(
    "jira_remove_vote",
    {
      title: "Remove Vote",
      description: "Remove your vote from an issue.",
      annotations: DESTRUCTIVE,
      inputSchema: z.object({ issueIdOrKey: z.string().min(1).describe("Issue key or ID") }),
    },
    withClient(async (client, _auth, { issueIdOrKey }) => {
      await client.delete(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`);
      return { success: true, issueKey: issueIdOrKey, message: `Vote removed successfully` };
    })
  );
}
