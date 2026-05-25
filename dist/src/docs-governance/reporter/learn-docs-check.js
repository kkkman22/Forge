import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const CHECKERS = [
    "scripts/check-docs-quota.ts",
    "scripts/check-docs-staleness.ts",
    "scripts/check-docs-links.ts",
];
const TIMEOUT_MS = 10_000;
function parseNdjsonLines(output, diags) {
    for (const line of output.trim().split("\n")) {
        if (!line.trim())
            continue;
        try {
            diags.push(JSON.parse(line));
        }
        catch {
            // Skip non-JSON lines
        }
    }
}
export function runDocsGovernanceCheck(rootDir) {
    const timestamp = new Date().toISOString();
    const allDiagnostics = [];
    const errors = [];
    let hasIssues = false;
    for (const script of CHECKERS) {
        const scriptPath = resolve(rootDir, script);
        try {
            const output = execFileSync("npx", ["tsx", scriptPath, "--json"], {
                cwd: rootDir,
                encoding: "utf-8",
                timeout: TIMEOUT_MS,
            });
            parseNdjsonLines(output, allDiagnostics);
        }
        catch (err) {
            const execErr = err;
            if (execErr.killed) {
                hasIssues = true;
                errors.push(`${script}: timed out after ${TIMEOUT_MS}ms`);
            }
            else if (typeof execErr.status === "number" && execErr.status !== 0) {
                // Non-zero exit — parse stdout/stderr for diagnostics
                const combined = `${execErr.stdout ?? ""}\n${execErr.stderr ?? ""}`;
                parseNdjsonLines(combined, allDiagnostics);
                // Check if any critical/error diagnostics were found
                if (allDiagnostics.some((d) => d.severity === "critical" || d.severity === "error")) {
                    hasIssues = true;
                }
            }
            else {
                hasIssues = true;
                const reason = execErr.code === "ENOENT"
                    ? "working directory not found"
                    : (execErr.message ?? "script missing or failed to execute");
                errors.push(`${script}: ${reason}`);
            }
        }
    }
    return {
        status: hasIssues ? "needs_attention" : "clean",
        timestamp,
        diagnostics: allDiagnostics,
        errors,
    };
}
export function formatDocsGovernanceSection(result) {
    const lines = ["## 文档治理诊断", ""];
    if (result.status === "clean") {
        lines.push(`**状态**: clean (${result.timestamp})`);
        lines.push("所有文档治理检查器通过，无关键问题。");
    }
    else {
        lines.push(`**状态**: needs_attention (${result.timestamp})`);
        lines.push("");
        const criticals = result.diagnostics.filter((d) => d.severity === "critical" || d.severity === "error");
        if (criticals.length > 0) {
            lines.push("### 关键问题");
            for (const d of criticals) {
                const file = d.file ? ` — ${d.file}` : "";
                lines.push(`- **${d.script}**${file}: ${d.message}`);
            }
        }
        if (result.errors.length > 0) {
            lines.push("");
            lines.push("### 执行错误");
            for (const e of result.errors) {
                lines.push(`- ${e}`);
            }
        }
    }
    lines.push("");
    return lines.join("\n");
}
//# sourceMappingURL=learn-docs-check.js.map