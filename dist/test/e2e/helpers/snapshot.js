/**
 * E2E helper — snapshot assertion utilities for git log and status verification.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
/**
 * Assert that the git log in `cwd` contains messages matching all provided regex patterns.
 * Checks messages in order from newest to oldest.
 */
export function assertGitLog(cwd, patterns) {
    const output = execFileSync("git", ["log", "--oneline", "--format=%s"], {
        cwd,
        encoding: "utf-8",
        timeout: 5000,
    }).trim();
    const messages = output ? output.split("\n") : [];
    for (const pattern of patterns) {
        const found = messages.some((msg) => pattern.test(msg));
        if (!found) {
            throw new Error(`Git log assertion failed: no message matching /${pattern.source}/.\n` +
                `Actual messages:\n${messages.map((m) => `  - ${m}`).join("\n")}`);
        }
    }
}
/**
 * Assert that a file exists at the given path and contains the expected content (optional).
 */
export function assertFileExists(path, contentPattern) {
    if (!existsSync(path)) {
        throw new Error(`File does not exist: ${path}`);
    }
    if (contentPattern) {
        const content = readFileSync(path, "utf-8");
        if (!contentPattern.test(content)) {
            throw new Error(`File content assertion failed: /${contentPattern.source}/ not found in ${path}.\n` +
                `Content preview: ${content.slice(0, 200)}`);
        }
    }
}
/**
 * Get the current git status as a string (for snapshot-style assertions).
 */
export function getGitStatus(cwd) {
    return execFileSync("git", ["status", "--porcelain"], {
        cwd,
        encoding: "utf-8",
        timeout: 5000,
    }).trim();
}
/**
 * Assert the working tree is clean (no uncommitted changes).
 */
export function assertWorkingTreeClean(cwd) {
    const status = getGitStatus(cwd);
    if (status) {
        throw new Error(`Working tree is not clean:\n${status}`);
    }
}
//# sourceMappingURL=snapshot.js.map