import { describe, expect, it } from "vitest";
import { extractAcceptanceCriteria, validateContract, } from "../../src/contract-validator.js";
function makeAC(overrides = {}) {
    return {
        id: "1.1",
        text: "WHEN foo THEN bar SHALL baz",
        verifyBy: "vitest:unit",
        evidence: "test/foo.test.ts passes",
        ...overrides,
    };
}
function makeSpecMD(criteria, legacy = false) {
    const frontmatter = legacy
        ? "---\nstatus: locked\ncontract_legacy: true\n---\n"
        : "---\nstatus: locked\n---\n";
    const acBlocks = criteria
        .map((c) => `${c.id}. WHEN ... THEN ... SHALL ...\n   **Verify-By**: ${c.verifyBy ?? ""}\n   **Evidence**: ${c.evidence ?? ""}`)
        .join("\n\n");
    return `${frontmatter}\n## Acceptance Criteria\n\n${acBlocks}\n`;
}
describe("contract-validator", () => {
    describe("extractAcceptanceCriteria", () => {
        it("extracts AC entries with Verify-By and Evidence from spec markdown", () => {
            const spec = makeSpecMD([makeAC()]);
            const result = extractAcceptanceCriteria(spec);
            expect(result).toHaveLength(1);
            expect(result[0].verifyBy).toBe("vitest:unit");
            expect(result[0].evidence).toBe("test/foo.test.ts passes");
        });
        it("returns entries with missing fields as empty strings", () => {
            const spec = makeSpecMD([makeAC({ verifyBy: "", evidence: "" })]);
            const result = extractAcceptanceCriteria(spec);
            expect(result).toHaveLength(1);
            expect(result[0].verifyBy).toBe("");
            expect(result[0].evidence).toBe("");
        });
    });
    describe("validateContract", () => {
        it("passes when all AC have valid Verify-By and non-empty Evidence", () => {
            const spec = makeSpecMD([makeAC()]);
            const result = validateContract(spec);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
        it("fails when Verify-By is missing (blocks lock)", () => {
            const spec = makeSpecMD([makeAC({ verifyBy: "" })]);
            const result = validateContract(spec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("Verify-By"))).toBe(true);
        });
        it("fails when Evidence is missing (blocks lock)", () => {
            const spec = makeSpecMD([makeAC({ evidence: "" })]);
            const result = validateContract(spec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("Evidence"))).toBe(true);
        });
        it("fails when Verify-By is not in layered whitelist", () => {
            const spec = makeSpecMD([makeAC({ verifyBy: "jest" })]);
            const result = validateContract(spec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("whitelist") || e.includes("Verify-By"))).toBe(true);
        });
        it("fails when Verify-By uses legacy flat grammar without :layer (Req1)", () => {
            const spec = makeSpecMD([makeAC({ verifyBy: "vitest" })]);
            const result = validateContract(spec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => /legacy flat grammar/i.test(e))).toBe(true);
        });
        it("fails when Evidence contains placeholder (TBD / 待补)", () => {
            const spec = makeSpecMD([makeAC({ evidence: "TBD" })]);
            const result = validateContract(spec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("placeholder") || e.includes("Evidence"))).toBe(true);
        });
        it("skips validation when contract_legacy: true in frontmatter", () => {
            const spec = makeSpecMD([makeAC({ verifyBy: "", evidence: "" })], true);
            const result = validateContract(spec);
            expect(result.valid).toBe(true);
            expect(result.legacySkipped).toBe(true);
        });
        it("accepts all layered whitelist Verify-By values (Req1 AC1)", () => {
            const whitelist = [
                "vitest:unit",
                "vitest:component",
                "bash:contract",
                "forge_exec:e2e",
                "manual",
            ];
            for (const v of whitelist) {
                const spec = makeSpecMD([makeAC({ verifyBy: v })]);
                const result = validateContract(spec);
                expect(result.valid, `Verify-By="${v}" should be valid`).toBe(true);
            }
        });
        it("legacy flat values pass only under contract_legacy: true grandfathering (NFR-2)", () => {
            const legacyWhitelist = ["vitest", "bash", "forge_git", "forge_exec", "manual"];
            for (const v of legacyWhitelist) {
                const spec = makeSpecMD([makeAC({ verifyBy: v })], true);
                const result = validateContract(spec);
                expect(result.valid, `legacy Verify-By="${v}" should pass under grandfathering`).toBe(true);
                expect(result.legacySkipped).toBe(true);
            }
        });
    });
});
//# sourceMappingURL=contract-validation.test.js.map