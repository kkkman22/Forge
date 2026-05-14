import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseSkeleton } from "../src/skill-skeleton.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function withFrontmatter(body, extra = "") {
    return ["---", `name: forge-test${extra}`, "---", "", body].join("\n");
}
function validSkill() {
    return withFrontmatter([
        "# Title",
        "",
        "## 1. Overview",
        "Some overview text.",
        "",
        "## 2. Prerequisites",
        "Some prereqs.",
        "",
        "## 3. Workflow",
        "Some workflow.",
        "",
        "## 4. Deliverable",
        "**Category**: execution",
        "- **Changed Files**: src/x.ts",
    ].join("\n"));
}
// ---------------------------------------------------------------------------
// Property: any input must not throw
// ---------------------------------------------------------------------------
describe("parseSkeleton — property", () => {
    it("never throws for any string input", () => {
        fc.assert(fc.property(fc.string(), (content) => {
            expect(() => parseSkeleton(content)).not.toThrow();
        }));
    });
    it("always returns required shape", () => {
        fc.assert(fc.property(fc.string(), (content) => {
            const result = parseSkeleton(content);
            expect(result).toHaveProperty("hasPrerequisites");
            expect(result).toHaveProperty("hasWorkflow");
            expect(result).toHaveProperty("hasDeliverable");
            expect(result).toHaveProperty("deliverableExempt");
            expect(result).toHaveProperty("legacyExempt");
            expect(result).toHaveProperty("valid");
            expect(result).toHaveProperty("errors");
        }));
    });
});
// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------
describe("parseSkeleton — unit", () => {
    it("returns valid when all three sections present", () => {
        const result = parseSkeleton(validSkill());
        expect(result.hasPrerequisites).toBe(true);
        expect(result.hasDeliverable).toBe(true);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });
    it("flags missing Deliverable when not exempt", () => {
        const doc = withFrontmatter(["## 1. Overview", "## 2. Prerequisites", "## 3. Workflow"].join("\n\n"));
        const result = parseSkeleton(doc);
        expect(result.hasDeliverable).toBe(false);
        expect(result.valid).toBe(false);
    });
    it("skips Deliverable check when deliverable_exempt: true", () => {
        const doc = withFrontmatter(["## 1. Overview", "## 2. Prerequisites", "## 3. Workflow"].join("\n\n"), "\ndeliverable_exempt: true");
        const result = parseSkeleton(doc);
        expect(result.deliverableExempt).toBe(true);
        expect(result.valid).toBe(true);
    });
    it("outputs warning but not fail when skeleton_exempt_legacy: true", () => {
        const doc = withFrontmatter(["## 1. Overview", "## 3. Workflow"].join("\n\n"), "\nskeleton_exempt_legacy: true");
        const result = parseSkeleton(doc);
        expect(result.legacyExempt).toBe(true);
        expect(result.valid).toBe(true);
    });
    it("detects Prerequisites section", () => {
        const doc = withFrontmatter("## 2. Prerequisites\nSome check.");
        expect(parseSkeleton(doc).hasPrerequisites).toBe(true);
    });
    it("detects Deliverable section", () => {
        const doc = withFrontmatter("## 4. Deliverable\nSomething.");
        expect(parseSkeleton(doc).hasDeliverable).toBe(true);
    });
});
//# sourceMappingURL=skill-skeleton.property.test.js.map