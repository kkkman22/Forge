/**
 * Unit tests for the failure auto-sink helpers.
 *
 * Covers the contracts listed in Requirements 8.6 and 8.7:
 *   - {@link buildFailureEpisode} produces a v2 `Episode` with
 *     `outcome: "failure"`, a deterministic id, and trigger metadata
 *     in the body.
 *   - {@link buildFailureEvolutionMarker} renders a marker string that
 *     round-trips through the evolution-marker parser with the
 *     expected `date | source | target` layout.
 *
 * **Validates: Requirements 8.6, 8.7**
 */
import { describe, expect, it } from "vitest";
import { parseEvolutionMarkers } from "../src/evolution-marker.js";
import { buildFailureEpisode, buildFailureEvolutionMarker, } from "../src/failure-sink.js";
const FIXED_NOW = new Date("2026-05-05T08:30:00.000Z");
function makeContext(overrides = {}) {
    return {
        skill: "forge-build",
        topic: "widget-refactor",
        tier: "standard",
        trigger: "three_strike",
        situation: "连续三次 TDD 失败，任务拆分过粗",
        ...overrides,
    };
}
describe("failure-sink — buildFailureEpisode", () => {
    it("produces an Episode with outcome=failure and schema_version=2", () => {
        const ep = buildFailureEpisode(makeContext(), FIXED_NOW, 1);
        expect(ep.schema_version).toBe(2);
        expect(ep.outcome).toBe("failure");
        expect(ep.skill).toBe("forge-build");
        expect(ep.tier).toBe("standard");
        expect(ep.id).toBe("ep-2026-05-05-001");
        expect(ep.date).toBe("2026-05-05");
    });
    it("embeds trigger / topic / tier / situation in the body", () => {
        const ep = buildFailureEpisode(makeContext(), FIXED_NOW, 2);
        expect(ep.body).toContain("trigger: three_strike");
        expect(ep.body).toContain("topic: widget-refactor");
        expect(ep.body).toContain("tier: standard");
        expect(ep.body).toContain("situation: 连续三次 TDD 失败，任务拆分过粗");
    });
    it("only sets root_cause and body line when rootCause is supplied", () => {
        const withCause = buildFailureEpisode(makeContext({ rootCause: "任务拆得太粗导致探针失灵" }), FIXED_NOW, 3);
        expect(withCause.root_cause).toBe("任务拆得太粗导致探针失灵");
        expect(withCause.body).toContain("root_cause: 任务拆得太粗导致探针失灵");
        const withoutCause = buildFailureEpisode(makeContext(), FIXED_NOW, 4);
        expect(withoutCause.root_cause).toBeUndefined();
        expect(withoutCause.body).not.toContain("root_cause:");
    });
    it("is deterministic under identical inputs", () => {
        const a = buildFailureEpisode(makeContext(), FIXED_NOW, 5);
        const b = buildFailureEpisode(makeContext(), FIXED_NOW, 5);
        expect(a).toEqual(b);
    });
    it("produces different lesson text per trigger", () => {
        const threeStrike = buildFailureEpisode(makeContext({ trigger: "three_strike" }), FIXED_NOW, 1);
        const newPattern = buildFailureEpisode(makeContext({ trigger: "new_review_pattern", skill: "forge-review" }), FIXED_NOW, 2);
        const shipGate = buildFailureEpisode(makeContext({ trigger: "ship_gate_blocked", skill: "forge-ship" }), FIXED_NOW, 3);
        expect(threeStrike.lesson).not.toBe(newPattern.lesson);
        expect(threeStrike.lesson).not.toBe(shipGate.lesson);
        expect(newPattern.lesson).not.toBe(shipGate.lesson);
    });
});
describe("failure-sink — buildFailureEvolutionMarker", () => {
    it("renders a marker matching the expected grammar", () => {
        const marker = buildFailureEvolutionMarker(makeContext(), "ep-2026-05-05-001", FIXED_NOW);
        const lines = marker.split("\n");
        expect(lines[0]).toBe("<!-- Evolution: 2026-05-05 | source: ep-2026-05-05-001 | target: forge-build#three_strike -->");
        expect(lines[1]).toBe("连续三次 TDD 失败，任务拆分过粗");
        expect(marker.endsWith("\n")).toBe(true);
    });
    it("round-trips through parseEvolutionMarkers", () => {
        const ctx = makeContext({
            skill: "forge-ship",
            trigger: "ship_gate_blocked",
            situation: "gate 拦截：checklist 未通过",
        });
        const marker = buildFailureEvolutionMarker(ctx, "ep-2026-05-05-007", FIXED_NOW);
        const parsed = parseEvolutionMarkers(marker, "progress/demo.md");
        expect(parsed).toHaveLength(1);
        expect(parsed[0].date).toBe("2026-05-05");
        expect(parsed[0].source).toBe("ep-2026-05-05-007");
        expect(parsed[0].target).toBe("forge-ship#ship_gate_blocked");
        expect(parsed[0].description).toBe("gate 拦截：checklist 未通过");
        expect(parsed[0].filePath).toBe("progress/demo.md");
        expect(parsed[0].lineNumber).toBe(1);
    });
});
//# sourceMappingURL=failure-sink.test.js.map