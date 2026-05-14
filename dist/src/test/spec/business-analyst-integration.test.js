import { describe, expect, it } from "vitest";
import { getCoreSubdomains, shouldTriggerBusinessAnalyst } from "../../src/spec.js";
describe("getCoreSubdomains", () => {
    it("returns union of all core_subdomains from enabled packs", () => {
        const packs = [
            { featureFlags: { core_subdomains: ["reservations", "folio-billing"] } },
            { featureFlags: { core_subdomains: ["night-audit"] } },
        ];
        expect(getCoreSubdomains(packs)).toEqual(expect.arrayContaining(["reservations", "folio-billing", "night-audit"]));
    });
    it("returns empty array when no packs are provided", () => {
        expect(getCoreSubdomains([])).toEqual([]);
    });
    it("treats pack missing core_subdomains as empty array", () => {
        const packs = [{ featureFlags: { core_subdomains: ["reservations"] } }, { featureFlags: {} }];
        expect(getCoreSubdomains(packs)).toEqual(["reservations"]);
    });
    it("deduplicates core_subdomains across multiple packs", () => {
        const packs = [
            { featureFlags: { core_subdomains: ["reservations", "folio-billing"] } },
            { featureFlags: { core_subdomains: ["folio-billing", "night-audit"] } },
        ];
        const result = getCoreSubdomains(packs);
        expect(result).toHaveLength(3);
        expect(result).toEqual(expect.arrayContaining(["reservations", "folio-billing", "night-audit"]));
    });
});
describe("shouldTriggerBusinessAnalyst", () => {
    it("returns true when context matches a core subdomain", () => {
        const packs = [{ featureFlags: { core_subdomains: ["reservations", "folio-billing"] } }];
        expect(shouldTriggerBusinessAnalyst("reservations", packs)).toBe(true);
    });
    it("returns false when context is not a core subdomain", () => {
        const packs = [{ featureFlags: { core_subdomains: ["reservations", "folio-billing"] } }];
        expect(shouldTriggerBusinessAnalyst("housekeeping", packs)).toBe(false);
    });
    it("returns false when context is undefined", () => {
        const packs = [{ featureFlags: { core_subdomains: ["reservations"] } }];
        expect(shouldTriggerBusinessAnalyst(undefined, packs)).toBe(false);
    });
    it("returns false when no packs are provided", () => {
        expect(shouldTriggerBusinessAnalyst("reservations", [])).toBe(false);
    });
});
//# sourceMappingURL=business-analyst-integration.test.js.map