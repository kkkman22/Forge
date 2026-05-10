import { describe, expect, it } from "vitest";
import { applyTriggerUpdates, DEFAULT_SIGNALS, scanForTriggers, } from "../src/evolved-rules-violations.js";
describe("scanForTriggers", () => {
    it("detects R1 violation pattern (是否继续)", () => {
        const text = "AI output: 阶段完成，是否继续进入下一阶段？";
        const report = scanForTriggers(text, "2026-05-10");
        expect(report.triggers.get("R1")).toBe("2026-05-10");
        expect(report.counts.get("R1")?.violations).toBeGreaterThan(0);
    });
    it("detects R1 guard pattern (自动进入)", () => {
        const text = "✅ build 完成 → 自动进入 review";
        const report = scanForTriggers(text, "2026-05-10");
        expect(report.triggers.get("R1")).toBe("2026-05-10");
        expect(report.counts.get("R1")?.guards).toBeGreaterThan(0);
    });
    it("detects R5 biome-ignore violation", () => {
        const text = "// biome-ignore lint/style/noNonNullAssertion: legacy test";
        const report = scanForTriggers(text, "2026-05-10");
        expect(report.triggers.get("R5")).toBe("2026-05-10");
        expect(report.counts.get("R5")?.violations).toBeGreaterThan(0);
    });
    it("detects R5 guard (config override)", () => {
        const text = `"noNonNullAssertion": "off"`;
        const report = scanForTriggers(text, "2026-05-10");
        expect(report.triggers.get("R5")).toBe("2026-05-10");
        expect(report.counts.get("R5")?.guards).toBeGreaterThan(0);
    });
    it("returns empty report for clean text", () => {
        const text = "Normal code review output. Everything looks good.";
        const report = scanForTriggers(text, "2026-05-10");
        expect(report.triggers.size).toBe(0);
        expect(report.counts.size).toBe(0);
    });
    it("skips signals with invalid regex without crashing", () => {
        const text = "test";
        const badSignals = [
            { ruleId: "R99", pattern: "[unclosed", type: "violation" },
        ];
        expect(() => scanForTriggers(text, "2026-05-10", badSignals)).not.toThrow();
    });
    it("DEFAULT_SIGNALS covers R1-R5", () => {
        const covered = new Set(DEFAULT_SIGNALS.map((s) => s.ruleId));
        expect(covered.has("R1")).toBe(true);
        expect(covered.has("R2")).toBe(true);
        expect(covered.has("R3")).toBe(true);
        expect(covered.has("R4")).toBe(true);
        expect(covered.has("R5")).toBe(true);
    });
});
describe("applyTriggerUpdates", () => {
    const sampleBody = `# Rules

### R1: Implicit Idle

**Content**: ...
**Confidence**: 0.9
**Last_triggered**: 2026-05-01

### R2: Review Existence

**Content**: ...
**Confidence**: 0.9
**Last_triggered**: 2026-05-02
`;
    it("updates Last_triggered for matching rule", () => {
        const triggers = new Map([["R1", "2026-05-10"]]);
        const report = { triggers, counts: new Map() };
        const updated = applyTriggerUpdates(sampleBody, report);
        expect(updated).toContain("**Last_triggered**: 2026-05-10");
        // R2 untouched
        expect(updated).toContain("**Last_triggered**: 2026-05-02");
    });
    it("returns body unchanged when no triggers", () => {
        const report = { triggers: new Map(), counts: new Map() };
        expect(applyTriggerUpdates(sampleBody, report)).toBe(sampleBody);
    });
    it("inserts Last_triggered line when absent", () => {
        const body = `### R3: New Rule

**Content**: ...
**Confidence**: 0.8

### R4: Other
`;
        const report = {
            triggers: new Map([["R3", "2026-05-10"]]),
            counts: new Map(),
        };
        const updated = applyTriggerUpdates(body, report);
        expect(updated).toContain("**Last_triggered**: 2026-05-10");
        // Must appear after Confidence, before next rule
        const r3Idx = updated.indexOf("### R3");
        const r4Idx = updated.indexOf("### R4");
        const triggerIdx = updated.indexOf("**Last_triggered**: 2026-05-10");
        expect(triggerIdx).toBeGreaterThan(r3Idx);
        expect(triggerIdx).toBeLessThan(r4Idx);
    });
    it("updates multiple rules simultaneously", () => {
        const triggers = new Map([
            ["R1", "2026-05-11"],
            ["R2", "2026-05-12"],
        ]);
        const report = { triggers, counts: new Map() };
        const updated = applyTriggerUpdates(sampleBody, report);
        expect(updated).toContain("**Last_triggered**: 2026-05-11");
        expect(updated).toContain("**Last_triggered**: 2026-05-12");
        expect(updated).not.toContain("2026-05-01");
        expect(updated).not.toContain("2026-05-02");
    });
});
//# sourceMappingURL=evolved-rules-violations.test.js.map