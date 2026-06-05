/**
 * Unit tests for src/compatibility.ts — Claude Code version gating.
 *
 * Validates Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 1.8.
 */
import { describe, expect, it } from "vitest";
describe("parseClaudeVersion", () => {
    it("extracts version from 'claude 2.1.163'", async () => {
        const { parseClaudeVersion } = await import("../src/compatibility.js");
        expect(parseClaudeVersion("claude 2.1.163")).toBe("2.1.163");
    });
    it("extracts version from 'Claude Code v2.1.163'", async () => {
        const { parseClaudeVersion } = await import("../src/compatibility.js");
        expect(parseClaudeVersion("Claude Code v2.1.163")).toBe("2.1.163");
    });
    it("extracts version from bare '2.1.163'", async () => {
        const { parseClaudeVersion } = await import("../src/compatibility.js");
        expect(parseClaudeVersion("2.1.163")).toBe("2.1.163");
    });
    it("extracts first version from multi-match '2.1.150 (build 2.1.163)'", async () => {
        const { parseClaudeVersion } = await import("../src/compatibility.js");
        expect(parseClaudeVersion("2.1.150 (build 2.1.163)")).toBe("2.1.150");
    });
    it("returns null for garbage input", async () => {
        const { parseClaudeVersion } = await import("../src/compatibility.js");
        expect(parseClaudeVersion("garbage")).toBeNull();
        expect(parseClaudeVersion("")).toBeNull();
        expect(parseClaudeVersion("2.1")).toBeNull();
        expect(parseClaudeVersion("v2.1")).toBeNull();
    });
});
describe("compareSemver", () => {
    it("equal versions return 0", async () => {
        const { compareSemver } = await import("../src/compatibility.js");
        expect(compareSemver("2.1.163", "2.1.163")).toBe(0);
    });
    it("lower major returns -1", async () => {
        const { compareSemver } = await import("../src/compatibility.js");
        expect(compareSemver("1.9.999", "2.0.0")).toBe(-1);
    });
    it("higher minor returns 1", async () => {
        const { compareSemver } = await import("../src/compatibility.js");
        expect(compareSemver("2.2.0", "2.1.163")).toBe(1);
    });
    it("higher patch returns 1", async () => {
        const { compareSemver } = await import("../src/compatibility.js");
        expect(compareSemver("2.1.200", "2.1.163")).toBe(1);
    });
});
describe("checkClaudeVersion", () => {
    const range = {
        minimum: "2.1.163",
        maximum: "2.1.170",
        verifiedLatest: "2.1.163",
    };
    it("exact minimum → pass", async () => {
        const { checkClaudeVersion } = await import("../src/compatibility.js");
        const result = checkClaudeVersion("2.1.163", range);
        expect(result.verdict).toBe("pass");
    });
    it("within range → pass", async () => {
        const { checkClaudeVersion } = await import("../src/compatibility.js");
        const result = checkClaudeVersion("2.1.165", range);
        expect(result.verdict).toBe("pass");
    });
    it("below minimum → fail", async () => {
        const { checkClaudeVersion } = await import("../src/compatibility.js");
        const result = checkClaudeVersion("2.1.150", range);
        expect(result.verdict).toBe("fail");
        expect(result.reason).toContain("2.1.150");
        expect(result.reason).toContain("2.1.163");
    });
    it("above maximum → warn", async () => {
        const { checkClaudeVersion } = await import("../src/compatibility.js");
        const result = checkClaudeVersion("2.1.200", range);
        expect(result.verdict).toBe("warn");
        expect(result.reason).toContain("2.1.170");
    });
    it("null current → unknown with fixHint", async () => {
        const { checkClaudeVersion } = await import("../src/compatibility.js");
        const result = checkClaudeVersion(null, range);
        expect(result.verdict).toBe("unknown");
        expect(result.currentVersion).toBeNull();
        expect(result.fixHint).toContain("claude --version");
    });
    it("no maximum defined → never warns on high version", async () => {
        const { checkClaudeVersion } = await import("../src/compatibility.js");
        const noMaxRange = { minimum: "2.1.163", verifiedLatest: "2.1.163" };
        const result = checkClaudeVersion("99.0.0", noMaxRange);
        expect(result.verdict).toBe("pass");
    });
});
//# sourceMappingURL=compatibility.test.js.map