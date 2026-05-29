import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { scanVueTemplate } from "../src/frontend-check.js";
const SAMPLE_RULES = [
    {
        id: "vue-a11y-click-non-button",
        pattern: "<(div|span|p|section|article)[^>]*@click",
        severity: "P1",
        wcag: "2.1.1 Keyboard",
        description: "Non-semantic element with @click",
        falsePositiveFilter: ['role="button"', "tabindex="],
    },
    {
        id: "vue-a11y-img-missing-alt",
        pattern: "<img(?![^>]*\\balt=)[^>]*>",
        severity: "P1",
        wcag: "1.1.1 Non-text Content",
        description: "img missing alt",
        falsePositiveFilter: [],
    },
];
describe("scanVueTemplate — property", () => {
    it("never throws for any content", () => {
        fc.assert(fc.property(fc.string(), fc.string(), (content, filePath) => {
            expect(() => scanVueTemplate(content, filePath, SAMPLE_RULES)).not.toThrow();
        }));
    });
    it("returns only violations with matching rule IDs", () => {
        fc.assert(fc.property(fc.string(), (content) => {
            const result = scanVueTemplate(content, "test.vue", SAMPLE_RULES);
            const ruleIds = new Set(SAMPLE_RULES.map((r) => r.id));
            for (const v of result) {
                expect(ruleIds).toContain(v.ruleId);
            }
        }));
    });
    it("returns valid severities", () => {
        const valid = new Set(["P0", "P1", "P2", "P3"]);
        fc.assert(fc.property(fc.string(), (content) => {
            const result = scanVueTemplate(content, "test.vue", SAMPLE_RULES);
            for (const v of result) {
                expect(valid).toContain(v.severity);
            }
        }));
    });
});
describe("scanVueTemplate — unit", () => {
    it("detects div with @click", () => {
        const content = '<template><div @click="handle">click me</div></template>';
        const result = scanVueTemplate(content, "Test.vue", SAMPLE_RULES);
        expect(result.some((v) => v.ruleId === "vue-a11y-click-non-button")).toBe(true);
    });
    it("no violation for button with @click", () => {
        const content = '<template><button @click="handle">click me</button></template>';
        const result = scanVueTemplate(content, "Test.vue", SAMPLE_RULES);
        expect(result.some((v) => v.ruleId === "vue-a11y-click-non-button")).toBe(false);
    });
    it("no violation for div with role=button and @click", () => {
        const content = '<template><div role="button" tabindex="0" @click="handle">ok</div></template>';
        const result = scanVueTemplate(content, "Test.vue", SAMPLE_RULES);
        expect(result.some((v) => v.ruleId === "vue-a11y-click-non-button")).toBe(false);
    });
    it("detects img without alt", () => {
        const content = '<template><img src="logo.png"></template>';
        const result = scanVueTemplate(content, "Test.vue", SAMPLE_RULES);
        expect(result.some((v) => v.ruleId === "vue-a11y-img-missing-alt")).toBe(true);
    });
    it("no violation for img with alt", () => {
        const content = '<template><img src="logo.png" alt="Logo"></template>';
        const result = scanVueTemplate(content, "Test.vue", SAMPLE_RULES);
        expect(result.some((v) => v.ruleId === "vue-a11y-img-missing-alt")).toBe(false);
    });
    it("returns empty for clean content", () => {
        const content = "<template><p>Hello world</p></template>";
        const result = scanVueTemplate(content, "Clean.vue", SAMPLE_RULES);
        expect(result).toEqual([]);
    });
});
//# sourceMappingURL=frontend-scan.property.test.js.map