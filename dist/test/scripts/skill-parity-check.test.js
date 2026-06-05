/**
 * Tests for SKILL-src parity validation script.
 *
 * Validates: Phase 3 T4 — Automated parity checking between
 * instructions.md rule markers and src/ enforcement counterparts.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
const SCRIPT = "scripts/skill-parity-check.mjs";
describe("skill-parity-check", () => {
    it("exits 0 on current codebase (all rules covered)", () => {
        const result = execFileSync("node", [SCRIPT], {
            cwd: process.cwd(),
            encoding: "utf-8",
            timeout: 30000,
        });
        // Script exits 0 when all enforceable rules have src/ counterparts
        expect(result).toBeTruthy();
    });
    it("reports IRON-LAW rules found in instructions", () => {
        const result = execFileSync("node", [SCRIPT], { encoding: "utf-8", timeout: 30000 });
        expect(result).toContain("IRON-LAW");
    });
    it("outputs structured summary with counts", () => {
        const result = execFileSync("node", [SCRIPT], { encoding: "utf-8", timeout: 30000 });
        expect(result).toMatch(/rules found/i);
    });
});
//# sourceMappingURL=skill-parity-check.test.js.map