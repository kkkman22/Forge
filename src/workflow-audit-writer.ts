import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditSubcommand = "review" | "decide" | "learn";

export interface AuditWriteTarget {
  subcommand: AuditSubcommand;
  runId: string;
  topic: string;
  payload: Record<string, unknown>;
}

export class FrozenZoneViolation extends Error {
  constructor(public readonly paths: string[]) {
    super(`FrozenZoneViolation: ${paths.join(", ")}`);
    this.name = "FrozenZoneViolation";
  }
}

// ---------------------------------------------------------------------------
// WorkflowAuditWriter
// ---------------------------------------------------------------------------

export class WorkflowAuditWriter {
  constructor(
    private forgeRoot: string,
    private frozenZoneChecker: (path: string) => boolean,
    private hookCheckPath?: string,
  ) {}

  async write(target: AuditWriteTarget): Promise<void> {
    const destPath = this.resolveDestPath(target);

    // Frozen-zone pre-check
    if (this.frozenZoneChecker(destPath)) {
      throw new FrozenZoneViolation([destPath]);
    }

    // Hook check: call external frozen-zone hook script
    if (this.hookCheckPath && existsSync(this.hookCheckPath)) {
      try {
        execFileSync("bash", [this.hookCheckPath, destPath], {
          stdio: "pipe",
          timeout: 5000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new FrozenZoneViolation([destPath, `hook rejected: ${msg}`]);
      }
    }

    // mkdir -p
    const dir = dirname(destPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Append-only write: read existing, append new content
    let existing = "";
    try {
      existing = readFileSync(destPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    const newSection = formatPayload(target);
    writeFileSync(destPath, existing + newSection, "utf-8");
  }

  private resolveDestPath(target: AuditWriteTarget): string {
    switch (target.subcommand) {
      case "review":
        return join(this.forgeRoot, "reviews", `${target.topic}.md`);
      case "decide":
        return join(this.forgeRoot, "decisions", `${isoDate()}-${slugify(target.topic)}.md`);
      case "learn":
        return join(this.forgeRoot, "knowledge", "sessions", `${target.runId}.md`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatPayload(target: AuditWriteTarget): string {
  return `\n---\n# ${target.subcommand} (${target.runId})\n\n${JSON.stringify(target.payload, null, 2)}\n`;
}
