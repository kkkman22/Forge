import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = resolve(import.meta.dirname, "..");
const HOOK = resolve(ROOT, ".githooks/pre-push");
describe("pre-push hook", () => {
    it("contains correct guard branch default (refs/heads/main)", () => {
        const content = readFileSync(HOOK, "utf-8");
        // biome-ignore lint/suspicious/noTemplateCurlyInString: matching shell parameter expansion in source file
        expect(content).toContain('guard_branch="${FORGE_PRE_PUSH_BRANCH:-refs/heads/main}"');
    });
    it("skips when target is not main", () => {
        const content = readFileSync(HOOK, "utf-8");
        expect(content).toContain('if [ "$target_main" -eq 0 ]; then');
        expect(content).toContain("exit 0");
    });
    it("runs npm run check when target is main", () => {
        const content = readFileSync(HOOK, "utf-8");
        expect(content).toContain("npm run check");
    });
    it("blocks push on failure with clear message", () => {
        const content = readFileSync(HOOK, "utf-8");
        expect(content).toContain("pre-push blocked");
        expect(content).toContain("--no-verify");
    });
    it("respects FORGE_PRE_PUSH_BRANCH override", () => {
        const content = readFileSync(HOOK, "utf-8");
        expect(content).toContain("FORGE_PRE_PUSH_BRANCH");
    });
    it("starts with proper shebang", () => {
        const content = readFileSync(HOOK, "utf-8");
        expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
    });
});
//# sourceMappingURL=pre-push-hook.integration.test.js.map