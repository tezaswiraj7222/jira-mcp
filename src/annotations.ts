/**
 * Reusable MCP tool annotation presets.
 *
 * These hints help MCP clients categorise, filter, and prioritise tools.
 * All properties are **hints** – they are not enforced by the protocol.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#annotations
 */

/** Read-only tool – safe to call without side-effects. */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Write tool that creates new resources (not idempotent – each call creates a new entity). */
export const WRITE_CREATE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/** Write tool that sets/updates state (idempotent – repeated calls yield the same result). */
export const WRITE_IDEMPOTENT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Destructive tool that removes or deletes resources. */
export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;
