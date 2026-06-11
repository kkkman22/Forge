/**
 * Tests for HooksProtectionMissingError and validateHooksPresence.
 *
 * **Validates: v2.4 Requirement 1.1, 1.2**
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForgeError, HooksProtectionMissingError } from "../src/forge-error.js";
import { validateHooksPresence } from "../src/hook-validator.js";
describe("HooksProtectionMissingError", () => {
    it("is instanceof ForgeError", () => {
        const err = new HooksProtectionMissingError("hooks/hooks.json not found", "/tmp/repo");
        expect(err).toBeInstanceOf(ForgeError);
    });
    it("is instanceof Error", () => {
        const err = new HooksProtectionMissingError("hooks/hooks.json not found", "/tmp/repo");
        expect(err).toBeInstanceOf(Error);
    });
    it('has code === "HOOKS_PROTECTION_MISSING"', () => {
        const err = new HooksProtectionMissingError("hooks/hooks.json not found", "/tmp/repo");
        expect(err.code).toBe("HOOKS_PROTECTION_MISSING");
    });
    it('has name === "HooksProtectionMissingError"', () => {
        const err = new HooksProtectionMissingError("hooks/hooks.json not found", "/tmp/repo");
        expect(err.name).toBe("HooksProtectionMissingError");
    });
    it("preserves reason", () => {
        const err = new HooksProtectionMissingError("PreToolUse section missing in hooks.json", "/cwd");
        expect(err.reason).toBe("PreToolUse section missing in hooks.json");
    });
    it("preserves cwd", () => {
        const err = new HooksProtectionMissingError("hooks.json parse failed", "/my/project");
        expect(err.cwd).toBe("/my/project");
    });
    it("includes reason in message", () => {
        const err = new HooksProtectionMissingError("hooks/hooks.json not found", "/tmp");
        expect(err.message).toContain("hooks/hooks.json not found");
    });
    it("includes remediation hint in message", () => {
        const err = new HooksProtectionMissingError("hooks/hooks.json not found", "/tmp");
        expect(err.message).toContain("--force-no-hooks");
        expect(err.message).toContain("scripts/init.sh");
    });
    it("includes cwd in message", () => {
        const err = new HooksProtectionMissingError("hooks.json parse failed", "/specific/path");
        expect(err.message).toContain("/specific/path");
    });
    it("is distinct from other ForgeError subclasses", () => {
        const err = new HooksProtectionMissingError("hooks/hooks.json not found", "/tmp");
        // Should be ForgeError but not other subclasses
        expect(err).toBeInstanceOf(ForgeError);
        expect(err.code).not.toBe("PROMPT_DEFENSE_REJECTED");
        expect(err.code).not.toBe("SCHEMA_VALIDATION_FAILED");
        expect(err.code).not.toBe("EVENT_LOG_REPLAY_MISMATCH");
    });
});
describe("validateHooksPresence", () => {
    let root;
    beforeEach(() => {
        root = join(tmpdir(), `forge-hook-val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        mkdirSync(join(root, "hooks"), { recursive: true });
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });
    it("throws HooksProtectionMissingError when hooks.json does not exist", () => {
        expect(() => validateHooksPresence(root)).toThrow(HooksProtectionMissingError);
        expect(() => validateHooksPresence(root)).toThrow("not found");
    });
    it("throws when PreToolUse section is missing", () => {
        writeFileSync(join(root, "hooks", "hooks.json"), JSON.stringify({ PostToolUse: [] }));
        expect(() => validateHooksPresence(root)).toThrow(HooksProtectionMissingError);
        expect(() => validateHooksPresence(root)).toThrow("PreToolUse");
    });
    it("throws when PreToolUse is an empty array", () => {
        writeFileSync(join(root, "hooks", "hooks.json"), JSON.stringify({ PreToolUse: [] }));
        expect(() => validateHooksPresence(root)).toThrow(HooksProtectionMissingError);
    });
    it("throws when hooks.json is invalid JSON", () => {
        writeFileSync(join(root, "hooks", "hooks.json"), "{not-json");
        expect(() => validateHooksPresence(root)).toThrow(HooksProtectionMissingError);
        expect(() => validateHooksPresence(root)).toThrow("parse failed");
    });
    it("passes silently when hooks.json has valid PreToolUse", () => {
        writeFileSync(join(root, "hooks", "hooks.json"), JSON.stringify({ PreToolUse: [{ matcher: "Write|Edit" }] }));
        expect(() => validateHooksPresence(root)).not.toThrow();
    });
    it("skips validation when options.skipValidation is true", () => {
        expect(() => validateHooksPresence(root, { skipValidation: true })).not.toThrow();
    });
});
//# sourceMappingURL=forge-error-hooks-protection.test.js.map