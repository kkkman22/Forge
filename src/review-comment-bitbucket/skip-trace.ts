import * as fs from "node:fs";
import * as path from "node:path";
import type { GateSkipReason, PostContext } from "./types.js";

const SKIP_REASONS: GateSkipReason[] = [
  "platform-not-bitbucket",
  "mcp-not-configured",
  "mcp-base-url-mismatch",
  "override-but-mcp-missing",
  "platform-disabled-by-config",
];

export async function recordSkip(
  reviewMarkdownPath: string,
  reason: GateSkipReason,
  ctx: PostContext,
): Promise<void> {
  // 1. Run markdown append
  try {
    const skipLine = `## comment_channel: skipped (reason: ${reason})\n`;
    await fs.promises.appendFile(reviewMarkdownPath, skipLine, "utf-8");
  } catch (e) {
    console.warn("Failed to append skip to review markdown:", e);
  }

  // 2. Daily skip file
  try {
    let baseDir = path.dirname(reviewMarkdownPath);
    let foundForge = false;
    while (baseDir !== path.dirname(baseDir)) {
      if (fs.existsSync(path.join(baseDir, ".tinkerman"))) {
        foundForge = true;
        break;
      }
      baseDir = path.dirname(baseDir);
    }

    if (!foundForge) {
      // Skip daily skip file if .forge not found
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const findingsDir = path.join(baseDir, ".tinkerman", "findings");
    const skipFilePath = path.join(findingsDir, `comment-channel-skipped-${dateStr}.md`);

    await fs.promises.mkdir(findingsDir, { recursive: true });

    const entry = `## Skip Entry\n- reason: ${reason}\n- remote_url: ${ctx.remoteUrl ?? "null"}\n- mcp_base_url: ${ctx.mcpBaseUrl ?? "null"}\n- run_id: ${ctx.runId}\n- timestamp: ${now.toISOString()}\n\n`;

    await fs.promises.appendFile(skipFilePath, entry, "utf-8");
  } catch (e) {
    console.warn("Failed to write daily skip file:", e);
  }

  // 3. Tool health counter
  try {
    let baseDir = path.dirname(reviewMarkdownPath);
    let foundForge = false;
    while (baseDir !== path.dirname(baseDir)) {
      if (fs.existsSync(path.join(baseDir, ".tinkerman"))) {
        foundForge = true;
        break;
      }
      baseDir = path.dirname(baseDir);
    }

    if (!foundForge) {
      // Skip tool health if .forge not found
      return;
    }

    const knowledgeDir = path.join(baseDir, ".tinkerman", "knowledge");
    const healthPath = path.join(knowledgeDir, "tool-health.md");

    await fs.promises.mkdir(knowledgeDir, { recursive: true });

    let content = "";
    if (fs.existsSync(healthPath)) {
      content = await fs.promises.readFile(healthPath, "utf-8");
    }

    // Parse existing counters
    const counters: Record<string, number> = {};
    for (const r of SKIP_REASONS) {
      const match = content.match(new RegExp(`^${r}.*count=(\\d+)`, "m"));
      counters[r] = match ? parseInt(match[1], 10) : 0;
    }

    // Increment the reason
    counters[reason] = (counters[reason] || 0) + 1;

    // Write back
    const lines: string[] = [];
    if (content.trim().length > 0) {
      lines.push(...content.split("\n").filter((l) => !SKIP_REASONS.some((r) => l.startsWith(r))));
    }

    lines.push(...SKIP_REASONS.map((r) => `${r} count=${counters[r]}`));

    await fs.promises.writeFile(healthPath, `${lines.join("\n")}\n`, "utf-8");
  } catch (e) {
    console.warn("Failed to update tool health counter:", e);
  }
}
