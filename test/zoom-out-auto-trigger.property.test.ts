/**
 * Property and unit tests for the auto-trigger zoom-out functions.
 *
 * Covers:
 *   - `shouldAutoTriggerZoomOut` — trigger condition logic for debug/decide
 *   - `formatAutoZoomOutInjection` — injection block formatting
 *   - Frequency limit enforcement (alreadyTriggered guard)
 *   - Determinism (same input → same output)
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ZoomOutOutput } from "../src/zoom-out.js";
import {
  type AutoTriggerContext,
  formatAutoZoomOutInjection,
  shouldAutoTriggerZoomOut,
} from "../src/zoom-out.js";

// ---------------------------------------------------------------------------
// shouldAutoTriggerZoomOut
// ---------------------------------------------------------------------------

describe("shouldAutoTriggerZoomOut", () => {
  // --- debug scenario ---

  it("triggers when debug log rounds >= 2 and not yet triggered", () => {
    const ctx: AutoTriggerContext = {
      scenario: "debug",
      debugLogRounds: 2,
      alreadyTriggered: false,
    };
    const result = shouldAutoTriggerZoomOut(ctx);
    expect(result.shouldTrigger).toBe(true);
    expect(result.scenario).toBe("debug");
    expect(result.reason).toBeTruthy();
  });

  it("does not trigger when debug log rounds < 2", () => {
    const ctx: AutoTriggerContext = {
      scenario: "debug",
      debugLogRounds: 1,
      alreadyTriggered: false,
    };
    expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
  });

  it("does not trigger when already triggered in this session", () => {
    const ctx: AutoTriggerContext = {
      scenario: "debug",
      debugLogRounds: 2,
      alreadyTriggered: true,
    };
    expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
  });

  // --- decide scenario ---

  it("triggers when decide rounds >= 2 and consensus not reached", () => {
    const ctx: AutoTriggerContext = {
      scenario: "decide",
      decideRounds: 2,
      decideConsensusReached: false,
      alreadyTriggered: false,
    };
    const result = shouldAutoTriggerZoomOut(ctx);
    expect(result.shouldTrigger).toBe(true);
    expect(result.scenario).toBe("decide");
  });

  it("triggers when decide user hesitation >= 3", () => {
    const ctx: AutoTriggerContext = {
      scenario: "decide",
      decideRounds: 1,
      decideConsensusReached: true,
      decideUserHesitationCount: 3,
      alreadyTriggered: false,
    };
    const result = shouldAutoTriggerZoomOut(ctx);
    expect(result.shouldTrigger).toBe(true);
  });

  it("does not trigger when decide has consensus and no hesitation", () => {
    const ctx: AutoTriggerContext = {
      scenario: "decide",
      decideRounds: 2,
      decideConsensusReached: true,
      decideUserHesitationCount: 0,
      alreadyTriggered: false,
    };
    expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
  });

  it("does not trigger when decide already triggered", () => {
    const ctx: AutoTriggerContext = {
      scenario: "decide",
      decideRounds: 3,
      decideConsensusReached: false,
      alreadyTriggered: true,
    };
    expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
  });

  // --- property: frequency limit is absolute ---

  it("property: alreadyTriggered=true always returns shouldTrigger=false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<"debug" | "decide">("debug", "decide"),
        fc.integer({ min: 0, max: 10 }),
        fc.boolean(),
        (scenario, rounds, consensus) => {
          const ctx: AutoTriggerContext = {
            scenario,
            alreadyTriggered: true,
            ...(scenario === "debug"
              ? { debugLogRounds: rounds }
              : { decideRounds: rounds, decideConsensusReached: consensus }),
          };
          expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
        },
      ),
    );
  });

  // --- property: deterministic ---

  it("is deterministic: same input → same output", () => {
    fc.assert(
      fc.property(
        fc.record({
          scenario: fc.constantFrom<"debug" | "decide">("debug", "decide"),
          debugLogRounds: fc.integer({ min: 0, max: 5 }),
          decideRounds: fc.integer({ min: 0, max: 5 }),
          decideConsensusReached: fc.boolean(),
          decideUserHesitationCount: fc.integer({ min: 0, max: 5 }),
          alreadyTriggered: fc.boolean(),
        }),
        (partial) => {
          const ctx: AutoTriggerContext = {
            scenario: partial.scenario,
            alreadyTriggered: partial.alreadyTriggered,
            ...(partial.scenario === "debug"
              ? { debugLogRounds: partial.debugLogRounds }
              : {
                  decideRounds: partial.decideRounds,
                  decideConsensusReached: partial.decideConsensusReached,
                  decideUserHesitationCount: partial.decideUserHesitationCount,
                }),
          };
          const a = shouldAutoTriggerZoomOut(ctx);
          const b = shouldAutoTriggerZoomOut(ctx);
          expect(a).toEqual(b);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// formatAutoZoomOutInjection
// ---------------------------------------------------------------------------

describe("formatAutoZoomOutInjection", () => {
  const sampleOutput: ZoomOutOutput = {
    overallLocation: "位于 src/ 核心模块",
    currentResponsibility: "负责用户认证",
    boundaryWithNeighbors: "上游 API Gateway，下游 User DB",
  };

  it("formats debug injection with [自动视角重置] prefix", () => {
    const result = formatAutoZoomOutInjection(sampleOutput, "debug");
    expect(result).toContain("[自动视角重置]");
    expect(result).toContain("整体位置");
    expect(result).toContain("位于 src/ 核心模块");
    expect(result).toContain("当前职责");
    expect(result).toContain("负责用户认证");
    expect(result).toContain("与邻居的边界");
    expect(result).toContain("上游 API Gateway，下游 User DB");
  });

  it("formats decide injection with [全局位置参考] prefix", () => {
    const result = formatAutoZoomOutInjection(sampleOutput, "decide");
    expect(result).toContain("[全局位置参考]");
  });

  it("wraps content in horizontal rules", () => {
    const result = formatAutoZoomOutInjection(sampleOutput, "debug");
    expect(result.startsWith("---")).toBe(true);
    expect(result.endsWith("---")).toBe(true);
  });

  it("is deterministic", () => {
    const out: ZoomOutOutput = {
      overallLocation: "a",
      currentResponsibility: "b",
      boundaryWithNeighbors: "c",
    };
    expect(formatAutoZoomOutInjection(out, "debug")).toBe(formatAutoZoomOutInjection(out, "debug"));
    expect(formatAutoZoomOutInjection(out, "decide")).toBe(
      formatAutoZoomOutInjection(out, "decide"),
    );
  });

  it("property: always contains the three section headings", () => {
    const sectionArb = fc.string({ minLength: 1, maxLength: 50 }).map((s) => s.replace(/\n/g, " "));
    fc.assert(
      fc.property(
        fc.record({
          overallLocation: sectionArb,
          currentResponsibility: sectionArb,
          boundaryWithNeighbors: sectionArb,
        }),
        fc.constantFrom<"debug" | "decide">("debug", "decide"),
        (output, scenario) => {
          const result = formatAutoZoomOutInjection(output, scenario);
          expect(result).toContain("## 整体位置");
          expect(result).toContain("## 当前职责");
          expect(result).toContain("## 与邻居的边界");
        },
      ),
    );
  });
});
