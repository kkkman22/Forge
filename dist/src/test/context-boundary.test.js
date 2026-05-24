import { describe, expect, it } from "vitest";
import { checkBoundary, parseImports, resolveFileContext } from "../src/context-boundary.js";
// ---------------------------------------------------------------------------
// resolveFileContext
// ---------------------------------------------------------------------------
describe("resolveFileContext", () => {
    const ownershipMap = {
        "src/domain/reservation/**": "reservations",
        "src/domain/guest/**": "guest-management",
        "src/domain/billing/**": "billing",
        "src/shared/**": "shared-kernel",
        "src/infrastructure/**": "infrastructure",
    };
    it("matches file path by directory prefix in ownership map", () => {
        expect(resolveFileContext("src/domain/reservation/services/booking-service.ts", ownershipMap, null)).toBe("reservations");
    });
    it("matches another context correctly", () => {
        expect(resolveFileContext("src/domain/guest/models/guest.ts", ownershipMap, null)).toBe("guest-management");
    });
    it("matches shared kernel files", () => {
        expect(resolveFileContext("src/shared/events.ts", ownershipMap, null)).toBe("shared-kernel");
    });
    it("returns null when no glob matches", () => {
        expect(resolveFileContext("src/unknown/something.ts", ownershipMap, null)).toBeNull();
    });
    it("JSDoc context overrides ownership map", () => {
        // Even though path would resolve to "guest-management", JSDoc wins
        expect(resolveFileContext("src/domain/guest/handlers/checkin.ts", ownershipMap, "reservations")).toBe("reservations");
    });
    it("returns JSDoc context even when path has no ownership match", () => {
        expect(resolveFileContext("src/utilities/helper.ts", ownershipMap, "billing")).toBe("billing");
    });
});
// ---------------------------------------------------------------------------
// parseImports
// ---------------------------------------------------------------------------
describe("parseImports", () => {
    it("extracts named import with line number", () => {
        const code = [
            'import { Something } from "./module-a";',
            'import { Other } from "./module-b";',
        ].join("\n");
        const imports = parseImports(code);
        expect(imports).toHaveLength(2);
        expect(imports[0]).toEqual({
            module: "./module-a",
            line: 1,
            hasEscapeHatch: false,
        });
        expect(imports[1]).toEqual({
            module: "./module-b",
            line: 2,
            hasEscapeHatch: false,
        });
    });
    it("extracts default import", () => {
        const code = 'import myDefault from "./utils";';
        const imports = parseImports(code);
        expect(imports).toHaveLength(1);
        expect(imports[0].module).toBe("./utils");
        expect(imports[0].line).toBe(1);
    });
    it("extracts side-effect import", () => {
        const code = 'import "./polyfill";';
        const imports = parseImports(code);
        expect(imports).toHaveLength(1);
        expect(imports[0].module).toBe("./polyfill");
    });
    it("extracts namespace import", () => {
        const code = 'import * as fs from "fs";';
        const imports = parseImports(code);
        expect(imports).toHaveLength(1);
        expect(imports[0].module).toBe("fs");
    });
    it("detects escape hatch comment on preceding line", () => {
        const code = [
            "// @forge:allow-cross-context legacy adapter needed",
            'import { LegacyService } from "../billing/service";',
        ].join("\n");
        const imports = parseImports(code);
        expect(imports).toHaveLength(1);
        expect(imports[0].hasEscapeHatch).toBe(true);
        expect(imports[0].module).toBe("../billing/service");
        expect(imports[0].line).toBe(2);
    });
    it("does not set escape hatch when comment is absent", () => {
        const code = ["// some regular comment", 'import { Service } from "../billing/service";'].join("\n");
        const imports = parseImports(code);
        expect(imports[0].hasEscapeHatch).toBe(false);
    });
    it("handles multiple imports with mixed escape hatches", () => {
        const code = [
            "// @forge:allow-cross-context reason A",
            'import { A } from "../billing/a";',
            'import { B } from "../billing/b";',
            "// @forge:allow-cross-context reason C",
            'import { C } from "../guest/c";',
        ].join("\n");
        const imports = parseImports(code);
        expect(imports).toHaveLength(3);
        expect(imports[0].hasEscapeHatch).toBe(true);
        expect(imports[1].hasEscapeHatch).toBe(false);
        expect(imports[2].hasEscapeHatch).toBe(true);
    });
    it("returns empty array for file with no imports", () => {
        const code = "const x = 42;\nexport { x };";
        expect(parseImports(code)).toEqual([]);
    });
});
// ---------------------------------------------------------------------------
// checkBoundary
// ---------------------------------------------------------------------------
describe("checkBoundary", () => {
    const ownershipMap = {
        "src/domain/reservation/**": "reservations",
        "src/domain/guest/**": "guest-management",
        "src/domain/billing/**": "billing",
        "src/shared/**": "shared-kernel",
    };
    function makeInput(overrides = {}) {
        return {
            filePath: "src/domain/reservation/services/booking.ts",
            fileContent: "",
            contextMap: [],
            ownershipMap,
            ...overrides,
        };
    }
    // --- partnership: allowed both directions ---
    it("partnership: no violation", () => {
        const input = makeInput({
            fileContent: 'import { GuestInfo } from "../../guest/models/guest";',
            contextMap: [
                {
                    source: "reservations",
                    target: "guest-management",
                    type: "partnership",
                    sourceLayer: "core",
                },
            ],
        });
        const result = checkBoundary(input);
        expect(result.violations).toEqual([]);
        expect(result.escapeHatchUsed).toBe(0);
    });
    // --- shared-kernel: allowed both directions ---
    it("shared-kernel: no violation", () => {
        const input = makeInput({
            fileContent: 'import { DomainEvent } from "../../../shared/events";',
            contextMap: [
                {
                    source: "reservations",
                    target: "shared-kernel",
                    type: "shared-kernel",
                    sourceLayer: "core",
                },
            ],
        });
        const result = checkBoundary(input);
        expect(result.violations).toEqual([]);
    });
    // --- undeclared: violation ---
    it("undeclared relationship: violation reported", () => {
        const input = makeInput({
            fileContent: 'import { Invoice } from "../../billing/models/invoice";',
            contextMap: [], // no entry between reservations and billing
        });
        const result = checkBoundary(input);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].sourceContext).toBe("reservations");
        expect(result.violations[0].targetContext).toBe("billing");
        expect(result.violations[0].relationshipType).toBe("undeclared");
        expect(result.violations[0].line).toBe(1);
        expect(result.violations[0].suggestion).toContain("context map");
    });
    // --- customer-supplier: violation (consumer side) ---
    it("customer-supplier: consumer gets violation with suggestion", () => {
        const input = makeInput({
            fileContent: 'import { BillingService } from "../../billing/service";',
            contextMap: [
                {
                    source: "reservations",
                    target: "billing",
                    type: "customer-supplier",
                    sourceLayer: "core",
                },
            ],
        });
        const result = checkBoundary(input);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].relationshipType).toBe("customer-supplier");
        expect(result.violations[0].suggestion).toContain("ACL");
    });
    // --- conformist: violation ---
    it("conformist: violation reported", () => {
        const input = makeInput({
            fileContent: 'import { GuestProfile } from "../../guest/profile";',
            contextMap: [
                {
                    source: "reservations",
                    target: "guest-management",
                    type: "conformist",
                    sourceLayer: "core",
                },
            ],
        });
        const result = checkBoundary(input);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].relationshipType).toBe("conformist");
    });
    // --- acl: allowed ---
    it("acl: no violation (approved pattern)", () => {
        const input = makeInput({
            fileContent: 'import { BillingAdapter } from "../../billing/acl/billing-adapter";',
            contextMap: [{ source: "reservations", target: "billing", type: "acl", sourceLayer: "core" }],
        });
        const result = checkBoundary(input);
        expect(result.violations).toEqual([]);
    });
    // --- open-host: allowed when importing from provider ---
    it("open-host: no violation when importing from provider", () => {
        const input = makeInput({
            // reservations imports from billing; billing is open-host provider
            fileContent: 'import { PublicApi } from "../../billing/api/public";',
            contextMap: [
                { source: "reservations", target: "billing", type: "open-host", sourceLayer: "core" },
            ],
        });
        const result = checkBoundary(input);
        expect(result.violations).toEqual([]);
    });
    // --- published-language: same as open-host ---
    it("published-language: no violation when importing from provider", () => {
        const input = makeInput({
            fileContent: 'import { Contract } from "../../billing/contracts/contract";',
            contextMap: [
                {
                    source: "reservations",
                    target: "billing",
                    type: "published-language",
                    sourceLayer: "core",
                },
            ],
        });
        const result = checkBoundary(input);
        expect(result.violations).toEqual([]);
    });
    // --- escape hatch ---
    it("escape hatch: violation bypassed and counted", () => {
        const input = makeInput({
            fileContent: [
                "// @forge:allow-cross-context legacy billing integration",
                'import { LegacyBilling } from "../../billing/legacy";',
            ].join("\n"),
            contextMap: [
                {
                    source: "reservations",
                    target: "billing",
                    type: "customer-supplier",
                    sourceLayer: "core",
                },
            ],
        });
        const result = checkBoundary(input);
        expect(result.violations).toHaveLength(0);
        expect(result.escapeHatchUsed).toBe(1);
    });
    // --- same context: no violation ---
    it("same context import: no violation", () => {
        const input = makeInput({
            // Both file and import resolve to "reservations"
            fileContent: 'import { BookingRepo } from "./booking-repo";',
            contextMap: [],
        });
        const result = checkBoundary(input);
        expect(result.violations).toEqual([]);
        expect(result.escapeHatchUsed).toBe(0);
    });
    // --- file not in any context: no-op ---
    it("file not in any context: empty result", () => {
        const input = makeInput({
            filePath: "src/utilities/helper.ts",
            fileContent: 'import { Something } from "../../billing/models/invoice";',
            contextMap: [],
        });
        const result = checkBoundary(input);
        expect(result.violations).toEqual([]);
        expect(result.escapeHatchUsed).toBe(0);
    });
    // --- multiple imports: mixed results ---
    it("multiple imports with mixed allowed/blocked", () => {
        const input = makeInput({
            fileContent: [
                'import { GuestInfo } from "../../guest/models/guest";',
                'import { Invoice } from "../../billing/models/invoice";',
            ].join("\n"),
            contextMap: [
                {
                    source: "reservations",
                    target: "guest-management",
                    type: "partnership",
                    sourceLayer: "core",
                },
                // billing is undeclared
            ],
        });
        const result = checkBoundary(input);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].targetContext).toBe("billing");
        expect(result.violations[0].relationshipType).toBe("undeclared");
    });
});
//# sourceMappingURL=context-boundary.test.js.map