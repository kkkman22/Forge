import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/message-display-hook.mjs");
const CONFIG_PATH = resolve(ROOT, ".forge/config.md");
/**
 * Helper: run the MessageDisplay hook with a given message content string.
 * Simulates Claude Code piping hook input JSON to stdin.
 */
function runHook(content, opts) {
    const input = JSON.stringify({
        hook_event_name: "MessageDisplay",
        session_id: "test-session",
        message: {
            role: "assistant",
            content,
        },
    });
    try {
        const stdout = execFileSync("node", [SCRIPT], {
            input,
            timeout: 8000,
            encoding: "utf-8",
            cwd: ROOT,
            env: {
                ...process.env,
                CLAUDE_PROJECT_DIR: ROOT,
                ...opts?.env,
            },
        });
        return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
    }
    catch (err) {
        const e = err;
        return {
            stdout: (e.stdout ?? "").trim(),
            stderr: (e.stderr ?? "").trim(),
            exitCode: e.status ?? 1,
        };
    }
}
/**
 * Helper: extract updatedDisplay from hook output JSON.
 */
function getUpdatedDisplay(stdout) {
    if (!stdout)
        return undefined;
    try {
        const obj = JSON.parse(stdout);
        return obj?.hookSpecificOutput?.updatedDisplay;
    }
    catch {
        return undefined;
    }
}
// ── Test data generators ──
/** Generate a long prose string of approximately `targetTokens` tokens.
 *  Using ~4 chars per token heuristic, so targetChars = targetTokens * 4. */
function longProse(targetTokens) {
    const sentences = [
        "I will now analyze the current state of the project and provide recommendations.",
        "Let me first examine the file structure to understand the codebase organization.",
        "Based on my analysis, I can see several areas that need improvement in the current implementation.",
        "The approach we should take involves refactoring the core modules while maintaining backward compatibility.",
        "This ensures that existing functionality remains intact while we introduce the new features.",
        "I recommend starting with the configuration layer since it affects all downstream components.",
        "After that, we can proceed to update the hook scripts to leverage the new platform capabilities.",
        "The testing strategy should focus on contract verification to ensure all hooks behave correctly.",
        "Finally, documentation updates will capture the architectural decisions and migration steps.",
        "This plan minimizes risk while delivering the maximum value to users of the framework.",
    ];
    const targetChars = targetTokens * 4;
    let result = "";
    let i = 0;
    while (result.length < targetChars) {
        result += `${sentences[i % sentences.length]} `;
        i++;
    }
    return result.trim();
}
/** Short prose under 200 tokens (~800 chars). */
function shortProse() {
    return "This is a brief response that should pass through unchanged. No folding needed here.";
}
// ── Contract tests ──
describe("MessageDisplay hook (R2) — contract tests", () => {
    describe("structured messages are preserved unchanged", () => {
        it("preserves messages containing <!-- forge:decision-point -->", () => {
            const content = `Some text\n\n<!-- forge:decision-point -->\n\nMore text here.`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("preserves messages containing ### ✅ markers", () => {
            const content = `### ✅ Build 完成\n\nAll tests passed.`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("preserves messages containing ### ⚠️ markers", () => {
            const content = `### ⚠️ 警告\n\n请检查配置。`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("preserves messages containing ### ❌ markers", () => {
            const content = `### ❌ 失败\n\n构建失败。`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("preserves messages containing ### 🛑 markers", () => {
            const content = `### 🛑 阻断\n\n发现 P0 问题。`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("preserves messages with markdown tables (3+ lines with | and ---)", () => {
            const content = `Results:\n\n| Col1 | Col2 |\n|------|------|\n| a | b |\n| c | d |`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("preserves messages with fenced code blocks", () => {
            const content = `Here is the code:\n\n\`\`\`typescript\nconst x = 1;\nconsole.log(x);\n\`\`\`\n\nDone.`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("preserves messages with skill output markers like [forge-review]", () => {
            const content = `[forge-review] Summary of findings...`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("preserves messages with skill output markers like [forge-spec]", () => {
            const content = `[forge-spec] Spec analysis complete.`;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
    });
    describe("long prose messages get folded with details/summary", () => {
        it("folds a message exceeding 200 tokens", () => {
            const content = longProse(300); // ~1200 chars, well over 200 tokens
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBeDefined();
            // Must contain the <details><summary> block
            expect(display).toContain("<details>");
            expect(display).toContain("</details>");
            expect(display).toContain("<summary>");
            expect(display).toContain("</summary>");
            // Summary should mention token count
            expect(display).toMatch(/展开（共 \d+ tokens）/);
            // First ~800 chars should be visible (summary portion)
            expect(display.startsWith(content.slice(0, 100))).toBe(true);
        }, 15000);
        it("includes full content inside the details block", () => {
            const content = longProse(250);
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            // The original content should appear somewhere in the output
            expect(display).toContain(content);
        });
        it("summary section is approximately first 800 chars", () => {
            const content = longProse(400);
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            // Content before <details> should be a prefix of the original
            const detailsIdx = display.indexOf("\n\n<details>");
            const summary = display.slice(0, detailsIdx);
            expect(summary.length).toBeLessThanOrEqual(810); // ~800 with some margin
            expect(content.startsWith(summary)).toBe(true);
        });
    });
    describe("short messages pass through unchanged", () => {
        it("does not fold messages under 200 tokens", () => {
            const content = shortProse();
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("does not fold empty messages", () => {
            const content = "";
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("does not fold messages at exactly 200 tokens boundary", () => {
            // Craft content that is exactly ~800 chars = 200 tokens (boundary).
            // Use "a ".repeat(800) for precise control: 800 chars = 200 tokens exactly.
            const content = "a ".repeat(400).trim(); // 799 chars => ceil(799/4) = 200
            const tokenEstimate = Math.ceil(content.length / 4);
            expect(tokenEstimate).toBeLessThanOrEqual(200);
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            // At exactly 200 tokens or below, should NOT be folded
            expect(display).toBe(content);
        });
    });
    describe("verbosity patterns are logged but not modified", () => {
        it("passes through messages containing '我将' unchanged (no folding)", () => {
            const content = "我将分析当前代码库的状态。";
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("passes through messages containing '让我先' unchanged (no folding)", () => {
            const content = "让我先检查文件结构。";
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
    });
    describe("config hook disabled → pass through", () => {
        it("exits 0 with no output when output_conciseness_hook is off", () => {
            // We test that the script checks config and exits early.
            // Since config.md currently has output_conciseness_hook: on,
            // we use env override or a mock approach.
            // The test verifies the script handles the off case.
            const content = longProse(300);
            const { stdout, exitCode } = runHook(content, {
                env: { FORGE_OUTPUT_CONCISENESS_HOOK: "off" },
            });
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            // When disabled, should return the content unchanged
            expect(display).toBe(content);
        });
    });
    describe("output format", () => {
        it("outputs valid JSON with hookSpecificOutput.updatedDisplay", () => {
            const content = "Hello world";
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const obj = JSON.parse(stdout);
            expect(obj).toHaveProperty("hookSpecificOutput");
            expect(obj.hookSpecificOutput).toHaveProperty("updatedDisplay");
            expect(typeof obj.hookSpecificOutput.updatedDisplay).toBe("string");
        });
    });
    describe("edge cases", () => {
        it("handles messages with only whitespace", () => {
            const content = "   \n\n   ";
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            expect(display).toBe(content);
        });
        it("handles messages with mixed structured and prose content (structured wins)", () => {
            const content = `${longProse(100)}\n\n\`\`\`js\nconst x = 1;\n\`\`\``;
            const { stdout, exitCode } = runHook(content);
            expect(exitCode).toBe(0);
            const display = getUpdatedDisplay(stdout);
            // Has code fence → preserved
            expect(display).toBe(content);
        });
        it("handles very long messages efficiently (under 100ms equivalent)", () => {
            const content = longProse(2000); // ~8000 chars
            const start = Date.now();
            const { stdout, exitCode } = runHook(content);
            const elapsed = Date.now() - start;
            expect(exitCode).toBe(0);
            // Script should complete in reasonable time
            expect(elapsed).toBeLessThan(1000);
            const display = getUpdatedDisplay(stdout);
            expect(display).toContain("<details>");
        });
    });
});
//# sourceMappingURL=message-display-hook.test.js.map