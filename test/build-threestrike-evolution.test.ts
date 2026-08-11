/**
 * Integration tests for the three-strike failure artefact helper added
 * in `src/build.ts`.
 *
 * Covers Requirement 8.6:
 *   - Three consecutive TDD failures on the same task feed into
 *     {@link buildThreeStrikeFailureArtifacts}, which must produce a
 *     v2 failure Episode and an Evolution marker targeting
 *     `forge-build#three_strike`.
 *   - The helper attaches an optional root cause when supplied.
 *   - Output is deterministic under identical inputs so drivers can
 *     replay safely.
 *
 * **Validates: Requirements 8.6, 8.12**
 */

import { describe, expect, it } from "vitest";
import { buildThreeStrikeFailureArtifacts } from "../src/build.js";
import { parseEvolutionMarkers } from "../src/evolution-marker.js";

const FIXED_NOW = new Date("2026-05-07T09:15:00.000Z");

describe("buildThreeStrikeFailureArtifacts — Requirement 8.6", () => {
  it("produces a failure Episode with forge-build trigger metadata", () => {
    const { episode, markerText } = buildThreeStrikeFailureArtifacts(
      "widget-refactor",
      "standard",
      "连续三次 TDD 失败于同一任务",
      undefined,
      FIXED_NOW,
      1,
    );

    expect(episode.schema_version).toBe(2);
    expect(episode.outcome).toBe("failure");
    expect(episode.skill).toBe("forge-build");
    expect(episode.tier).toBe("standard");
    expect(episode.id).toBe("ep-2026-05-07-001");
    expect(episode.situation).toBe("连续三次 TDD 失败于同一任务");
    expect(episode.body).toContain("trigger: three_strike");
    expect(episode.body).toContain("topic: widget-refactor");

    expect(markerText).toBeTruthy();
  });

  it("renders an Evolution marker targeting forge-build#three_strike", () => {
    const { episode, markerText } = buildThreeStrikeFailureArtifacts(
      "widget-refactor",
      "standard",
      "连续三次 TDD 失败于同一任务",
      undefined,
      FIXED_NOW,
      1,
    );
    const parsed = parseEvolutionMarkers(markerText, ".tinkerman/progress/widget-refactor.md");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].target).toBe("forge-build#three_strike");
    expect(parsed[0].source).toBe(episode.id);
    expect(parsed[0].description).toBe("连续三次 TDD 失败于同一任务");
  });

  it("attaches the root cause when provided", () => {
    const { episode } = buildThreeStrikeFailureArtifacts(
      "widget-refactor",
      "full",
      "三次连续失败",
      "任务拆得太粗",
      FIXED_NOW,
      2,
    );
    expect(episode.root_cause).toBe("任务拆得太粗");
    expect(episode.body).toContain("root_cause: 任务拆得太粗");
  });

  it("omits root_cause when not provided", () => {
    const { episode } = buildThreeStrikeFailureArtifacts(
      "widget-refactor",
      "light",
      "三次连续失败",
      undefined,
      FIXED_NOW,
      3,
    );
    expect(episode.root_cause).toBeUndefined();
    expect(episode.body).not.toContain("root_cause:");
  });

  it("is deterministic under identical inputs", () => {
    const a = buildThreeStrikeFailureArtifacts(
      "deterministic",
      "standard",
      "三次失败",
      "cause",
      FIXED_NOW,
      5,
    );
    const b = buildThreeStrikeFailureArtifacts(
      "deterministic",
      "standard",
      "三次失败",
      "cause",
      FIXED_NOW,
      5,
    );
    expect(a.episode).toEqual(b.episode);
    expect(a.markerText).toBe(b.markerText);
  });
});
