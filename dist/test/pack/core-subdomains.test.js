import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
describe("core_subdomains field", () => {
    const packYamlPath = path.resolve(import.meta.dirname, "../../packs/pms/pack.yaml");
    const content = fs.readFileSync(packYamlPath, "utf-8");
    it("declares core_subdomains in feature_flags", () => {
        expect(content).toContain("core_subdomains:");
    });
    it("includes reservations as core subdomain", () => {
        expect(content).toMatch(/core_subdomains:[\s\S]*- reservations/);
    });
    it("includes folio-billing as core subdomain", () => {
        expect(content).toMatch(/core_subdomains:[\s\S]*- folio-billing/);
    });
    it("includes night-audit as core subdomain", () => {
        expect(content).toMatch(/core_subdomains:[\s\S]*- night-audit/);
    });
});
//# sourceMappingURL=core-subdomains.test.js.map