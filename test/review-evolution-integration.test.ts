/**
 * Integration tests for the review evolution artefact helper added in
 * `src/review.ts`.
 *
 * Covers Requirement 8.5:
 *   - A new problem pattern that does not match any existing
 *     `knowledge/solutions/*.md` entry produces a v2 failure episode
 *     plus an Evolution marker targeting
 *     `forge-review#new_review_pattern`.
 *   - A known-failure match echoes the pattern name on `patternUpdate`
 *     so the driver can increment its success counter.
 *   - When neither signal is set, the helper returns an empty object.
 *
 * **Validates: Requirements 8.5, 8.12**
 */

import { describe, expect, it } from "vitest";
import { parseEvolutionMarkers } from "../src/evolution-marker.js";
import { buildReviewEvolutionArtifacts } from "../src/review.js";

const FIXED_NOW = new Date("2026-05-06T12:00:00.000Z");

describe("buildReviewEvolutionArtifacts — Requirement 8.5", () => {
  it("builds an episode + marker when a new pattern is detected", () => {
    const artefacts = buildReviewEvolutionArtifacts(
      {
        topic: "skills-cross-pollination",
        tier: "full",
        newPatternSituation: "review 发现跨 skill import 循环尚未沉淀",
      },
      FIXED_NOW,
      1,
    );

    expect(artefacts.episode).toBeDefined();
    expect(artefacts.markerText).toBeDefined();
    expect(artefacts.patternUpdate).toBeUndefined();

    const ep = artefacts.episode;
    if (!ep) throw new Error("expected episode");
    expect(ep.schema_version).toBe(2);
    expect(ep.outcome).toBe("failure");
    expect(ep.skill).toBe("forge-review");
    expect(ep.tier).toBe("full");
    expect(ep.id).toBe("ep-2026-05-06-001");
    expect(ep.situation).toBe("review 发现跨 skill import 循环尚未沉淀");

    const marker = artefacts.markerText;
    if (!marker) throw new Error("expected marker");
    const parsed = parseEvolutionMarkers(marker, ".tinkerman/reviews/demo.md");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].target).toBe("forge-review#new_review_pattern");
    expect(parsed[0].source).toBe(ep.id);
    expect(parsed[0].description).toBe("review 发现跨 skill import 循环尚未沉淀");
  });

  it("echoes the matched pattern name without building an episode", () => {
    const artefacts = buildReviewEvolutionArtifacts(
      {
        topic: "auth-hardening",
        tier: "standard",
        matchedFailurePattern: "模块导入路径在 monorepo 中解析失败",
      },
      FIXED_NOW,
      1,
    );

    expect(artefacts.episode).toBeUndefined();
    expect(artefacts.markerText).toBeUndefined();
    expect(artefacts.patternUpdate).toBe("模块导入路径在 monorepo 中解析失败");
  });

  it("returns both pieces when a run surfaces a new pattern AND matches an existing one", () => {
    const artefacts = buildReviewEvolutionArtifacts(
      {
        topic: "auth-hardening",
        tier: "standard",
        newPatternSituation: "新发现：JWT 刷新窗口未做时钟漂移容忍",
        matchedFailurePattern: "token 过期边界 off-by-one",
      },
      FIXED_NOW,
      2,
    );

    expect(artefacts.episode?.id).toBe("ep-2026-05-06-002");
    expect(artefacts.markerText).toContain("target: forge-review#new_review_pattern");
    expect(artefacts.patternUpdate).toBe("token 过期边界 off-by-one");
  });

  it("returns an empty object when neither signal is provided", () => {
    const artefacts = buildReviewEvolutionArtifacts({ topic: "noop", tier: "light" }, FIXED_NOW, 1);
    expect(artefacts.episode).toBeUndefined();
    expect(artefacts.markerText).toBeUndefined();
    expect(artefacts.patternUpdate).toBeUndefined();
  });

  it("ignores empty-string signals as if they were absent", () => {
    const artefacts = buildReviewEvolutionArtifacts(
      {
        topic: "noop",
        tier: "light",
        newPatternSituation: "",
        matchedFailurePattern: "",
      },
      FIXED_NOW,
      1,
    );
    expect(artefacts.episode).toBeUndefined();
    expect(artefacts.markerText).toBeUndefined();
    expect(artefacts.patternUpdate).toBeUndefined();
  });

  it("is deterministic under identical inputs", () => {
    const input = {
      topic: "skills-cross-pollination",
      tier: "full" as const,
      newPatternSituation: "deterministic run",
    };
    const a = buildReviewEvolutionArtifacts(input, FIXED_NOW, 7);
    const b = buildReviewEvolutionArtifacts(input, FIXED_NOW, 7);
    expect(a).toEqual(b);
  });
});
