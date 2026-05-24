/**
 * P0-1: detectSpecKind — detect feature vs bugfix spec from directory contents.
 */
import { describe, expect, it } from "vitest";
import { detectSpecKind } from "../src/spec-kind.js";
describe("detectSpecKind", () => {
    it("returns 'bugfix' when bugfix.md exists", () => {
        expect(detectSpecKind(["bugfix.md", "design.md", "tasks.md"])).toBe("bugfix");
    });
    it("returns 'feature' when requirements.md exists", () => {
        expect(detectSpecKind(["requirements.md", "design.md", "tasks.md"])).toBe("feature");
    });
    it("returns 'feature' for legacy spec.md", () => {
        expect(detectSpecKind(["spec.md"])).toBe("feature");
    });
    it("returns 'feature' by default for empty dir", () => {
        expect(detectSpecKind([])).toBe("feature");
    });
    it("prefers bugfix over feature when both exist", () => {
        expect(detectSpecKind(["requirements.md", "bugfix.md"])).toBe("bugfix");
    });
    it("ignores unrelated files", () => {
        expect(detectSpecKind(["spec.legacy.md", "notes.md", "output.log"])).toBe("feature");
    });
    it("forces bugfix when mode='fix' regardless of files", () => {
        expect(detectSpecKind(["requirements.md", "design.md"], "fix")).toBe("bugfix");
    });
});
//# sourceMappingURL=spec-kind.test.js.map