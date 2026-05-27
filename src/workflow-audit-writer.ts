/**
 * WorkflowAuditWriter — appends Forge audit records when review/decide/learn
 * workflows complete. Maintains the §config Guarded_Zone append-only invariant
 * (existing content always remains a strict prefix), respects the Frozen_Zone
 * (aborts and records `frozen_zone_blocked: true` in dispatch.jsonl), and
 * delegates pre-write validation to a configurable hook (default: hook-check-
 * frozen.sh).
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 4
 *   - .kiro/specs/workflows-integration/design.md §3.x — WorkflowAuditWriter
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { appendDispatchRecord, frozenZoneRecord } from "./dispatch-record.js";

const SAFE_SLUG_RE = /^[a-zA-Z0-9._-]{1,64}$/;

export class InvalidIdentifierError extends Error {
  constructor(field: string, value: string) {
    super(`invalid ${field}: ${JSON.stringify(value)} — must match ${SAFE_SLUG_RE.source}`);
    this.name = "InvalidIdentifierError";
  }
}

export class PathContainmentError extends Error {
  constructor(dest: string, base: string) {
    super(`path containment violation: ${dest} escapes ${base}`);
    this.name = "PathContainmentError";
  }
}

function assertSafeSlug(field: string, value: string): void {
  if (!SAFE_SLUG_RE.test(value) || value === "." || value === "..") {
    throw new InvalidIdentifierError(field, value);
  }
}

function assertContained(dest: string, base: string): void {
  const absDest = resolve(dest);
  const absBase = resolve(base);
  // resolve() collapses `..` segments; if absDest doesn't start with absBase
  // followed by either path separator or end-of-string, it escaped.
  if (
    absDest !== absBase &&
    !absDest.startsWith(`${absBase}/`) &&
    !absDest.startsWith(`${absBase}\\`)
  ) {
    throw new PathContainmentError(absDest, absBase);
  }
}

export type AuditSubcommand = "review" | "decide" | "learn";

export interface AuditWriteContext {
  /** Forge root, e.g. `.forge` (absolute or relative). */
  forgeRoot: string;
  /** Run identifier — recorded into dispatch.jsonl on violation. */
  runId: string;
  /** Optional session id (passed through to dispatch.jsonl on violation). */
  sessionId?: string;
  /** Which workflow produced this record. */
  subcommand: AuditSubcommand;
  /** Logical topic / branch slug — required for review and decide. */
  topic?: string;
  /** ISO-8601 date for decide — defaults to today (UTC). */
  date?: string;

  /**
   * Optional callback to short-circuit when the resolved destination is a
   * frozen zone path. Defaults to false (no Frozen_Zone enforcement).
   * Production wiring passes {@link isFrozenZonePath} from check-frozen.ts.
   */
  isFrozenZone?: (destPath: string) => boolean;

  /**
   * Optional pre-write validation hook. Returns the exit code of
   * `hook-check-frozen.sh` or any equivalent. Non-zero aborts the write.
   * Production wiring delegates to a child_process.spawnSync call.
   */
  preWriteHook?: (destPath: string) => number;
}

export class FrozenZoneViolation extends Error {
  constructor(public readonly destPath: string) {
    super(`frozen_zone_blocked: cannot write to ${destPath}`);
    this.name = "FrozenZoneViolation";
  }
}

export function resolveDestPath(ctx: AuditWriteContext): string {
  // F13: validate slug-shaped fields against /^[a-zA-Z0-9._-]{1,64}$/ before
  // they're spliced into a filesystem path. Rejects "../foo", "/etc/passwd",
  // empty strings, NUL bytes, and other path-traversal payloads.
  assertSafeSlug("runId", ctx.runId);
  if (ctx.subcommand === "review") {
    if (!ctx.topic) throw new InvalidIdentifierError("topic", "");
    assertSafeSlug("topic", ctx.topic);
  }
  if (ctx.subcommand === "decide" && ctx.date) {
    assertSafeSlug("date", ctx.date);
  }

  let dest: string;
  switch (ctx.subcommand) {
    case "review":
      dest = join(ctx.forgeRoot, "reviews", `${ctx.topic}.md`);
      break;
    case "decide": {
      const date = ctx.date ?? new Date().toISOString().slice(0, 10);
      const slug = slugify(ctx.topic ?? "untitled");
      dest = join(ctx.forgeRoot, "decisions", `${date}-${slug}.md`);
      break;
    }
    case "learn":
      dest = join(ctx.forgeRoot, "knowledge", "sessions", `${ctx.runId}.md`);
      break;
  }

  // F13: assert resolved dest stays under forgeRoot. Belt-and-braces — slug
  // validation already prevents `..`, but defence-in-depth costs nothing.
  assertContained(dest, isAbsolute(ctx.forgeRoot) ? ctx.forgeRoot : resolve(ctx.forgeRoot));
  return dest;
}

export function writeAuditRecord(ctx: AuditWriteContext, content: string): string {
  const dest = resolveDestPath(ctx);

  if (ctx.isFrozenZone?.(dest)) {
    appendDispatchRecord(
      ctx.forgeRoot,
      ctx.runId,
      frozenZoneRecord(ctx.subcommand, ctx.runId, ctx.sessionId),
    );
    throw new FrozenZoneViolation(dest);
  }

  if (ctx.preWriteHook) {
    const code = ctx.preWriteHook(dest);
    if (code !== 0) {
      throw new Error(`preWriteHook aborted (exit ${code}) for ${dest}`);
    }
  }

  // mkdir -p the parent dir, then append-only.
  const parent = dest.slice(0, dest.lastIndexOf("/"));
  if (parent) mkdirSync(parent, { recursive: true });
  appendFileSync(dest, content);
  return dest;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}
