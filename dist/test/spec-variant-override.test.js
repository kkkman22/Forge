/**
 * T-04b: Chat-layer variant override parsing tests.
 *
 * parseVariantOverride: extracts variant from natural language.
 *
 * Validates: Requirements 2, 8
 */
import { describe, expect, it } from "vitest";
import { parseVariantOverride } from "../src/spec-variant-override.js";
describe("parseVariantOverride", () => {
    it("parses '切换到 design-first'", () => {
        expect(parseVariantOverride("切换到 design-first")).toBe("design-first");
    });
    it("parses '切换为 requirements-first'", () => {
        expect(parseVariantOverride("切换为 requirements-first")).toBe("requirements-first");
    });
    it("parses '用 quick plan'", () => {
        expect(parseVariantOverride("用 quick plan")).toBe("quick-plan");
    });
    it("parses '换成 quick'", () => {
        expect(parseVariantOverride("换成 quick")).toBe("quick-plan");
    });
    it("parses 'switch to design first'", () => {
        expect(parseVariantOverride("switch to design first")).toBe("design-first");
    });
    it("parses 'use requirements first'", () => {
        expect(parseVariantOverride("use requirements first")).toBe("requirements-first");
    });
    it("parses 'design-first' directly", () => {
        expect(parseVariantOverride("design-first")).toBe("design-first");
    });
    it("parses 'quick-plan' directly", () => {
        expect(parseVariantOverride("quick-plan")).toBe("quick-plan");
    });
    it("parses 'requirements-first' directly", () => {
        expect(parseVariantOverride("requirements-first")).toBe("requirements-first");
    });
    it("returns null for non-override text", () => {
        expect(parseVariantOverride("我同意这个方案")).toBeNull();
    });
    it("returns null for empty string", () => {
        expect(parseVariantOverride("")).toBeNull();
    });
    it("handles mixed case", () => {
        expect(parseVariantOverride("切换到 Design-First")).toBe("design-first");
    });
});
//# sourceMappingURL=spec-variant-override.test.js.map