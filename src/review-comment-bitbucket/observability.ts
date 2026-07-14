import * as fs from "node:fs";
import * as path from "node:path";
// P3-5: redact secrets from error messages before persisting to
// .forge/findings/. The Bitbucket client may surface token-bearing error
// text; without redaction it lands on disk in plaintext.
import { redactSecrets } from "../secret-redactor.js";
import type { ToolFailure } from "./types.js";

export async function recordPartialFailures(
  failures: ToolFailure[],
  baseDir: string,
): Promise<void> {
  if (failures.length === 0) {
    return;
  }

  try {
    const dateStr = new Date(failures[0].timestamp).toISOString().split("T")[0];
    const errorFilePath = path.join(
      baseDir,
      ".forge",
      "findings",
      `comment-channel-error-${dateStr}.md`,
    );
    const findingsDir = path.dirname(errorFilePath);

    await fs.promises.mkdir(findingsDir, { recursive: true });

    for (const failure of failures) {
      // P3-5: redact before persisting — error_message may carry tokens.
      const safeError = redactSecrets(failure.error_message);
      const entry = `## Tool Failure\n- finding_hash: ${failure.finding_hash}\n- tool_name: ${failure.tool_name}\n- error_message: ${safeError}\n- timestamp: ${new Date(failure.timestamp).toISOString()}\n\n`;
      await fs.promises.appendFile(errorFilePath, entry, "utf-8");
    }
  } catch (e) {
    console.warn("Failed to record partial failures:", e);
  }
}

export async function appendRunMetrics(
  params: {
    run_id: string;
    post_enabled: boolean;
    gate_skipped_reason: string | null;
    creates: number;
    dones: number;
    reopens: number;
    skips: number;
    partial_failures: number;
    set_review_status_called: boolean;
    total_duration_ms: number;
  },
  baseDir: string,
): Promise<void> {
  try {
    const metricsPath = path.join(baseDir, ".forge", "knowledge", "metrics.md");
    const knowledgeDir = path.dirname(metricsPath);

    await fs.promises.mkdir(knowledgeDir, { recursive: true });

    const line = `run_id=${params.run_id}, post_enabled=${params.post_enabled}, gate_skipped_reason=${params.gate_skipped_reason ?? "null"}, creates=${params.creates}, dones=${params.dones}, reopens=${params.reopens}, skips=${params.skips}, partial_failures=${params.partial_failures}, set_review_status_called=${params.set_review_status_called}, total_duration_ms=${params.total_duration_ms}\n`;

    await fs.promises.appendFile(metricsPath, line, "utf-8");
  } catch (e) {
    console.warn("Failed to append run metrics:", e);
  }
}
