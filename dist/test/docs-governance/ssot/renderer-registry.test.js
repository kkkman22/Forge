import { describe, expect, it } from "vitest";
import { createRendererRegistry } from "../../../src/docs-governance/ssot/renderer-registry.js";
const noopRenderer = (_input) => ({
    markdown: "",
    diagnostics: [],
});
describe("createRendererRegistry", () => {
    it("creates an empty registry", () => {
        const reg = createRendererRegistry();
        expect(reg.list()).toEqual([]);
    });
    it("registers and resolves a renderer", () => {
        const reg = createRendererRegistry();
        reg.register("test-renderer", noopRenderer);
        const fn = reg.resolve("test-renderer");
        expect(fn).toBe(noopRenderer);
    });
    it("returns undefined for unknown renderer", () => {
        const reg = createRendererRegistry();
        expect(reg.resolve("nonexistent")).toBeUndefined();
    });
    it("lists all registered renderer names", () => {
        const reg = createRendererRegistry();
        const fn2 = () => ({ markdown: "b", diagnostics: [] });
        reg.register("alpha", noopRenderer);
        reg.register("beta", fn2);
        const names = reg.list();
        expect(names).toContain("alpha");
        expect(names).toContain("beta");
        expect(names).toHaveLength(2);
    });
    it("overwrites renderer when registering same name twice", () => {
        const reg = createRendererRegistry();
        const fn1 = () => ({ markdown: "first", diagnostics: [] });
        const fn2 = () => ({ markdown: "second", diagnostics: [] });
        reg.register("dup", fn1);
        reg.register("dup", fn2);
        expect(reg.resolve("dup")).toBe(fn2);
        expect(reg.list()).toHaveLength(1);
    });
    it("registered renderer is callable and returns correct result", () => {
        const reg = createRendererRegistry();
        const fn = (input) => ({
            markdown: `rendered:${input.topic}`,
            diagnostics: [],
        });
        reg.register("callable", fn);
        const resolved = reg.resolve("callable");
        const result = resolved({ topic: "test", renderer: "callable", args: {}, source: null });
        expect(result.markdown).toBe("rendered:test");
    });
    it("list returns readonly array", () => {
        const reg = createRendererRegistry();
        reg.register("x", noopRenderer);
        const list = reg.list();
        // Should not be directly mutable — verify it returns a copy or readonly
        expect(() => {
            list.push("hack");
        }).not.toThrow(); // it's fine if it doesn't throw, but the registry should not be affected
        expect(reg.list()).toHaveLength(1);
        expect(reg.list()).toEqual(["x"]);
    });
    it("resolves distinct functions for distinct names", () => {
        const reg = createRendererRegistry();
        const fnA = () => ({ markdown: "a", diagnostics: [] });
        const fnB = () => ({ markdown: "b", diagnostics: [] });
        reg.register("a", fnA);
        reg.register("b", fnB);
        expect(reg.resolve("a")).toBe(fnA);
        expect(reg.resolve("b")).toBe(fnB);
        expect(reg.resolve("a")).not.toBe(fnB);
    });
});
//# sourceMappingURL=renderer-registry.test.js.map