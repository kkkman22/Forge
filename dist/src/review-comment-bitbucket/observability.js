import * as fs from "node:fs";
import * as path from "node:path";
export async function recordPartialFailures(failures, baseDir) {
    if (failures.length === 0) {
        return;
    }
    try {
        const dateStr = new Date(failures[0].timestamp).toISOString().split("T")[0];
        const errorFilePath = path.join(baseDir, ".forge", "findings", `comment-channel-error-${dateStr}.md`);
        const findingsDir = path.dirname(errorFilePath);
        await fs.promises.mkdir(findingsDir, { recursive: true });
        for (const failure of failures) {
            const entry = `## Tool Failure\n- finding_hash: ${failure.finding_hash}\n- tool_name: ${failure.tool_name}\n- error_message: ${failure.error_message}\n- timestamp: ${new Date(failure.timestamp).toISOString()}\n\n`;
            await fs.promises.appendFile(errorFilePath, entry, "utf-8");
        }
    }
    catch (e) {
        console.warn("Failed to record partial failures:", e);
    }
}
export async function appendRunMetrics(params, baseDir) {
    try {
        const metricsPath = path.join(baseDir, ".forge", "knowledge", "metrics.md");
        const knowledgeDir = path.dirname(metricsPath);
        await fs.promises.mkdir(knowledgeDir, { recursive: true });
        const line = `run_id=${params.run_id}, post_enabled=${params.post_enabled}, gate_skipped_reason=${params.gate_skipped_reason ?? "null"}, creates=${params.creates}, dones=${params.dones}, reopens=${params.reopens}, skips=${params.skips}, partial_failures=${params.partial_failures}, set_review_status_called=${params.set_review_status_called}, total_duration_ms=${params.total_duration_ms}\n`;
        await fs.promises.appendFile(metricsPath, line, "utf-8");
    }
    catch (e) {
        console.warn("Failed to append run metrics:", e);
    }
}
//# sourceMappingURL=observability.js.map