import { describe, expect, it, vi, beforeEach } from "vitest";
import { classifyTask, _resetIntentDictCache } from "../../src/router.js";

vi.mock("../../src/prompt-defense.js", () => ({
  scanInput: vi.fn(() => ({
    safe: true,
    threats: [],
    detectionTimeMs: 0.1,
  })),
}));

const BASE_SIGNALS = {
  filesAffected: 3,
  linesChanged: 50,
  hasExistingSpec: true,
  hasNewService: false,
  hasNewDatabase: false,
  hasAuthChanges: false,
  isVagueRequirement: false,
  hasClearRequirements: true,
};

beforeEach(() => {
  _resetIntentDictCache();
});

describe("Audit log schema validation (T-12)", () => {
  it("ClassificationResult hints still use RouteHint schema (no new fields)", () => {
    const result = classifyTask(
      BASE_SIGNALS,
      "standard",
      undefined,
      "backend",
      "iteration",
      "feature",
      "深思熟虑地实现",
    );

    for (const hint of result.hints) {
      expect(Object.keys(hint).sort()).toEqual(
        expect.arrayContaining(["command", "tag", "description"]),
      );
      // source is optional, only allowed values
      if (hint.source !== undefined) {
        expect(["taskType", "projectPhase", "workNature", "intent"]).toContain(hint.source);
      }
    }
  });

  it("source field is optional enum, no other fields added", () => {
    const result = classifyTask(BASE_SIGNALS, "standard");
    for (const hint of result.hints) {
      const keys = Object.keys(hint);
      expect(keys.length).toBeLessThanOrEqual(4);
      for (const k of keys) {
        expect(["command", "tag", "description", "source"]).toContain(k);
      }
    }
  });

  it("intent hints appear alongside taskType hints in the same array", () => {
    const result = classifyTask(
      BASE_SIGNALS,
      "standard",
      undefined,
      "backend",
      "iteration",
      "feature",
      "深思熟虑地做后端 API",
    );

    const hasTaskTypeHints = result.hints.some((h) => h.source === "taskType");
    const hasIntentHints = result.hints.some((h) => h.source === "intent");

    // Both sources should coexist
    if (hasIntentHints) {
      expect(hasTaskTypeHints).toBe(true);
    }
  });
});
