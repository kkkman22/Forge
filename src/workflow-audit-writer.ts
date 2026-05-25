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
import { join } from "node:path";

export type AuditSubcommand = "review" | "decide" | "learn";

export interface AuditWriteContext {
  /** Forge root, e.g. `.forge` (absolute or relative). */
  forgeRoot: string;
  /** Run identifier — recorded into dispatch.jsonl on violation. */
  runId: string;
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
  switch (ctx.subcommand) {
    case "review":
      return join(ctx.forgeRoot, "reviews", `${ctx.topic ?? "unknown"}.md`);
    case "decide": {
      const date = ctx.date ?? new Date().toISOString().slice(0, 10);
      const slug = slugify(ctx.topic ?? "untitled");
      return join(ctx.forgeRoot, "decisions", `${date}-${slug}.md`);
    }
    case "learn":
      return join(ctx.forgeRoot, "knowledge", "sessions", `${ctx.runId}.md`);
  }
}

export function writeAuditRecord(ctx: AuditWriteContext, content: string): string {
  const dest = resolveDestPath(ctx);

  if (ctx.isFrozenZone?.(dest)) {
    appendDispatchRecord(ctx, true);
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

function appendDispatchRecord(ctx: AuditWriteContext, frozenZoneBlocked: boolean): void {
  const runDir = join(ctx.forgeRoot, "runs", ctx.runId);
  mkdirSync(runDir, { recursive: true });
  const record = {
    subcommand: ctx.subcommand,
    run_id: ctx.runId,
    frozen_zone_blocked: frozenZoneBlocked,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(join(runDir, "dispatch.jsonl"), `${JSON.stringify(record)}\n`);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}
