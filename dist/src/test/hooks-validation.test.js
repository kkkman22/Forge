/**
 * Unit tests for the validateHooksPresence function.
 *
 * Tests the pure-function hooks validation logic using real filesystem
 * operations (temp directories) to avoid vi.mock interference.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateHooksPresence } from "../src/sdk-driver.js";
describe("validateHooksPresence", () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "hooks-test-"));
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });
    it("returns valid: true when hooks.json exists with PreToolUse array", () => {
        const hooksDir = join(tmpDir, "hooks");
        mkdirSync(hooksDir, { recursive: true });
        writeFileSync(join(hooksDir, "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Write" }] } }));
        const result = validateHooksPresence(tmpDir);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
    });
    it("returns valid: false when hooks.json does not exist", () => {
        const result = validateHooksPresence(tmpDir);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("hooks/hooks.json not found");
    });
    it("returns valid: false when PreToolUse section is missing", () => {
        const hooksDir = join(tmpDir, "hooks");
        mkdirSync(hooksDir, { recursive: true });
        writeFileSync(join(hooksDir, "hooks.json"), JSON.stringify({ hooks: { SessionStart: [] } }));
        const result = validateHooksPresence(tmpDir);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("PreToolUse section missing in hooks.json");
    });
    it("returns valid: false when PreToolUse is not an array", () => {
        const hooksDir = join(tmpDir, "hooks");
        mkdirSync(hooksDir, { recursive: true });
        writeFileSync(join(hooksDir, "hooks.json"), JSON.stringify({ hooks: { PreToolUse: "not-an-array" } }));
        const result = validateHooksPresence(tmpDir);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("PreToolUse section missing in hooks.json");
    });
    it("returns valid: false when hooks.json contains invalid JSON", () => {
        const hooksDir = join(tmpDir, "hooks");
        mkdirSync(hooksDir, { recursive: true });
        writeFileSync(join(hooksDir, "hooks.json"), "not valid json {{{");
        const result = validateHooksPresence(tmpDir);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("hooks.json parse failed");
    });
    it("returns valid: true for empty PreToolUse array", () => {
        const hooksDir = join(tmpDir, "hooks");
        mkdirSync(hooksDir, { recursive: true });
        writeFileSync(join(hooksDir, "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [] } }));
        const result = validateHooksPresence(tmpDir);
        expect(result.valid).toBe(true);
    });
});
//# sourceMappingURL=hooks-validation.test.js.map