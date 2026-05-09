import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import { READ_ONLY, WRITE_CREATE } from "../annotations.js";

export function registerAttachmentTools(server: McpServer): void {
  server.registerTool(
    "jira_get_attachments",
    {
      title: "Get Issue Attachments",
      description: "Get all attachments for an issue.",
      annotations: READ_ONLY,
      inputSchema: z.object({ issueIdOrKey: z.string().min(1).describe("Issue key or ID") }),
    },
    withClient(async (client, _auth, { issueIdOrKey }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`,
        { params: { fields: "attachment" } }
      );
      const attachments = Array.isArray(response.data?.fields?.attachment)
        ? response.data.fields.attachment.map((a: any) => ({
            id: a.id, filename: a.filename, size: a.size, mimeType: a.mimeType,
            content: a.content, thumbnail: a.thumbnail,
            author: a.author?.displayName, created: a.created,
          }))
        : [];
      return { issueKey: issueIdOrKey, attachments };
    })
  );

  server.registerTool(
    "jira_upload_attachment",
    {
      title: "Upload Attachment",
      description: "Upload a file attachment to an issue. Requires the file path on the local filesystem.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        issueIdOrKey: z.string().describe("Issue ID or key"),
        filePath: z.string().describe("Absolute path to the file to upload"),
        filename: z.string().optional().describe("Override the filename (defaults to original filename)"),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, filePath, filename }) => {
      const fs = await import("fs");
      const path = await import("path");
      const FormData = (await import("form-data")).default;

      if (!fs.existsSync(filePath)) {
        return { error: true, message: `File not found: ${filePath}` };
      }

      const form = new FormData();
      const fileStream = fs.createReadStream(filePath);
      const finalFilename = filename || path.basename(filePath);
      form.append("file", fileStream, finalFilename);

      const response = await client.post(
        `/rest/api/3/issue/${issueIdOrKey}/attachments`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            "X-Atlassian-Token": "no-check",
          },
        }
      );

      const attachments = response.data || [];
      return {
        success: true,
        attachments: attachments.map((a: any) => ({
          id: a.id, filename: a.filename, size: a.size, mimeType: a.mimeType,
          created: a.created, author: a.author?.displayName, content: a.content,
        })),
      };
    })
  );

  server.registerTool(
    "jira_get_attachment_metadata",
    {
      title: "Get Attachment Metadata",
      description: "Get metadata for a specific attachment by ID.",
      annotations: READ_ONLY,
      inputSchema: z.object({ id: z.string().describe("Attachment ID") }),
    },
    withClient(async (client, _auth, { id }) => {
      const response = await client.get(`/rest/api/3/attachment/${id}`);
      const a = response.data;
      return {
        id: a.id, filename: a.filename, size: a.size, mimeType: a.mimeType,
        created: a.created,
        author: a.author ? { accountId: a.author.accountId, displayName: a.author.displayName } : undefined,
        content: a.content, thumbnail: a.thumbnail, self: a.self,
      };
    })
  );

  server.registerTool(
    "jira_get_attachment_content",
    {
      title: "Get Attachment Content",
      description: "Get the content/download URL for an attachment. Returns the redirect URL or content depending on redirect setting.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        id: z.string().describe("Attachment ID"),
        redirect: z.boolean().optional().default(true).describe("Whether to return redirect URL (true) or follow redirect (false)"),
      }),
    },
    withClient(async (client, _auth, { id, redirect }) => {
      const response = await client.get(`/rest/api/3/attachment/content/${id}`, {
        params: { redirect },
        maxRedirects: redirect ? 0 : 5,
        validateStatus: (status) => status < 400 || status === 302,
      });

      if (response.status === 302 || response.headers.location) {
        return {
          downloadUrl: response.headers.location || response.data,
          message: "Use this URL to download the attachment content",
        };
      }

      return {
        contentType: response.headers["content-type"],
        contentLength: response.headers["content-length"],
        message: "Content retrieved. For binary files, use the download URL instead.",
      };
    })
  );
}
