/**
 * Integration tests for the ship-gate-blocked artefact helper added in
 * `src/ship.ts`.
 *
 * Covers Requirement 8.7:
 *   - `uncommitted` → `outcome: "partial"` (work not lost, user just
 *     needs to commit).
 *   - `checklist_failed` → `outcome: "failure"` (an unverified P1 fix
 *     slipped through).
 *   - In both cases the Evolution marker targets
 *     `forge-ship#ship_gate_blocked`.
 *
 * **Validates: Requirements 8.7, 8.12**
 */

import { describe, expect, it } from "vitest";
import { parseEvolutionMarkers } from "../src/evolution-marker.js";
import { buildShipGateBlockArtifacts } from "../src/ship.js";

const FIXED_NOW = new Date("2026-05-08T14:00:00.000Z");

describe("buildShipGateBlockArtifacts — Requirement 8.7", () => {
  it("maps 'uncommitted' reason to a partial outcome", () => {
    const { episode, markerText } = buildShipGateBlockArtifacts(
      "order-export",
      "standard",
      "uncommitted",
      "ship gate 拦截：存在未提交的本地修改",
      FIXED_NOW,
      1,
    );

    expect(episode.outcome).toBe("partial");
    expect(episode.schema_version).toBe(2);
    expect(episode.skill).toBe("forge-ship");
    expect(episode.id).toBe("ep-2026-05-08-001");
    expect(episode.situation).toBe("ship gate 拦截：存在未提交的本地修改");
    expect(episode.body).toContain("trigger: ship_gate_blocked");

    const parsed = parseEvolutionMarkers(markerText, ".tinkerman/progress/order-export.md");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].target).toBe("forge-ship#ship_gate_blocked");
    expect(parsed[0].source).toBe(episode.id);
  });

  it("maps 'checklist_failed' reason to a failure outcome", () => {
    const { episode, markerText } = buildShipGateBlockArtifacts(
      "order-export",
      "full",
      "checklist_failed",
      "ship gate 拦截：P1 Fix Checklist 未全部验证",
      FIXED_NOW,
      2,
    );

    expect(episode.outcome).toBe("failure");
    expect(episode.id).toBe("ep-2026-05-08-002");
    expect(episode.tier).toBe("full");

    const parsed = parseEvolutionMarkers(markerText, ".tinkerman/progress/order-export.md");
    expect(parsed[0].target).toBe("forge-ship#ship_gate_blocked");
    expect(parsed[0].description).toBe("ship gate 拦截：P1 Fix Checklist 未全部验证");
  });

  it("is deterministic under identical inputs", () => {
    const a = buildShipGateBlockArtifacts(
      "deterministic",
      "standard",
      "uncommitted",
      "situation",
      FIXED_NOW,
      3,
    );
    const b = buildShipGateBlockArtifacts(
      "deterministic",
      "standard",
      "uncommitted",
      "situation",
      FIXED_NOW,
      3,
    );
    expect(a.episode).toEqual(b.episode);
    expect(a.markerText).toBe(b.markerText);
  });

  it("propagates tier from the call site", () => {
    const { episode: light } = buildShipGateBlockArtifacts(
      "topic",
      "light",
      "uncommitted",
      "x",
      FIXED_NOW,
      1,
    );
    const { episode: full } = buildShipGateBlockArtifacts(
      "topic",
      "full",
      "checklist_failed",
      "x",
      FIXED_NOW,
      1,
    );
    expect(light.tier).toBe("light");
    expect(full.tier).toBe("full");
  });
});
