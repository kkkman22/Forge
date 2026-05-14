/**
 * Tests for HooksProtectionMissingError.
 *
 * **Validates: v2.4 Requirement 1.1, 1.2**
 */
import { describe, expect, it } from "vitest";
import { ForgeError, HooksProtectionMissingError } from "../src/forge-error.js";
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
//# sourceMappingURL=forge-error-hooks-protection.test.js.map