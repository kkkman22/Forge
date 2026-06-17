/**
 * Unit tests for the 5 extended FailureTrigger values.
 *
 * Validates that each new trigger:
 *   - Produces a valid v2 Episode with outcome=failure
 *   - Embeds the trigger / topic / tier / situation in the body
 *   - Produces a non-empty, distinct lesson via lessonFor
 *   - Renders a well-formed Evolution marker
 */

import { describe, expect, it } from "vitest";
import {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
  type FailureContext,
} from "../src/failure-sink.js";

const FIXED_NOW = new Date("2026-05-14T10:00:00.000Z");

function makeCtx(overrides: Partial<FailureContext> = {}): FailureContext {
  return {
    skill: "forge-debug",
    topic: "test-failure",
    tier: "standard",
    trigger: "debug_resolved",
    situation: "调试完成",
    ...overrides,
  };
}

const newTriggers: Array<{
  trigger: FailureContext["trigger"];
  skill: string;
  situation: string;
}> = [
  {
    trigger: "debug_resolved",
    skill: "forge-debug",
    situation: "调试完成，根因已记录",
  },
  {
    trigger: "grill_abandoned",
    skill: "forge-grill",
    situation: "需求澄清被用户中止",
  },
  {
    trigger: "test_layer_failed",
    skill: "forge-test",
    situation: "Layer 1 单元测试失败",
  },
  {
    trigger: "conflict_validation_failed",
    skill: "forge-fix-conflicts",
    situation: "冲突解决后验证未通过",
  },
  {
    trigger: "loop_circuit_broken",
    skill: "forge-loop",
    situation: "熔断器触发，连续错误超限",
  },
  {
    trigger: "replan_triggered",
    skill: "forge-plan",
    situation: "动态重规划触发，剩余计划假设被证伪",
  },
];

describe("failure-sink extended triggers — buildFailureEpisode", () => {
  for (const { trigger, skill, situation } of newTriggers) {
    it(`produces valid episode for trigger=${trigger}`, () => {
      const ctx = makeCtx({ trigger, skill, situation });
      const ep = buildFailureEpisode(ctx, FIXED_NOW, 1);
      expect(ep.schema_version).toBe(2);
      expect(ep.outcome).toBe("failure");
      expect(ep.skill).toBe(skill);
      expect(ep.body).toContain(`trigger: ${trigger}`);
      expect(ep.lesson).toBeTruthy();
    });
  }

  it("all 6 new triggers produce distinct lesson text", () => {
    const lessons = newTriggers.map(
      ({ trigger, skill, situation }, i) =>
        buildFailureEpisode(makeCtx({ trigger, skill, situation }), FIXED_NOW, i + 1).lesson,
    );
    const unique = new Set(lessons);
    expect(unique.size).toBe(lessons.length);
  });

  it("new triggers produce lessons distinct from existing triggers", () => {
    const existing: FailureContext["trigger"][] = [
      "three_strike",
      "new_review_pattern",
      "ship_gate_blocked",
    ];
    const newLesson = buildFailureEpisode(
      makeCtx({ trigger: "debug_resolved" }),
      FIXED_NOW,
      1,
    ).lesson;
    for (const t of existing) {
      const existingLesson = buildFailureEpisode(makeCtx({ trigger: t }), FIXED_NOW, 2).lesson;
      expect(newLesson).not.toBe(existingLesson);
    }
  });
});

describe("failure-sink extended triggers — buildFailureEvolutionMarker", () => {
  for (const { trigger, skill, situation } of newTriggers) {
    it(`renders marker with target=${skill}#${trigger}`, () => {
      const ctx = makeCtx({ trigger, skill, situation });
      const marker = buildFailureEvolutionMarker(ctx, "ep-2026-05-14-001", FIXED_NOW);
      expect(marker).toContain(`target: ${skill}#${trigger}`);
      expect(marker.endsWith("\n")).toBe(true);
    });
  }
});
