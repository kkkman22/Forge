/**
 * Test-pyramid classification + verdict aggregation — extracted from
 * accept-driver.ts (P3-1).
 *
 * Originally lines 663-815 of accept-driver.ts.
 */

import type { AcceptanceRunResult, ScenarioArtifact, ScenarioType } from "../accept.js";

/** Pyramid shape classification (Req5 AC2). Advisory; never blocks ship. */
export type PyramidShape = "healthy" | "e2e-heavy" | "empty-middle" | "no-unit" | "empty";

/** Per-layer health counts (Req5 AC1). */
export interface LayerHealth {
  pass: number;
  fail: number;
  inconclusive: number;
}

export interface LayerHealthBreakdown {
  unit: LayerHealth;
  component: LayerHealth;
  contract: LayerHealth;
  e2e: LayerHealth;
}

/**
 * Map a ScenarioType to its pyramid layer. ADR-0006: api/ui/cli/mixed all run
 * as real end-to-end (curl / browser / shell), so they fold into the e2e layer.
 * unit/component/contract are the three delegate (cheap) layers.
 */
export function layerOf(type: ScenarioType | undefined): "unit" | "component" | "contract" | "e2e" {
  switch (type) {
    case "unit":
      return "unit";
    case "component":
      return "component";
    case "contract":
      return "contract";
    // api/ui/cli/mixed/unknown/undefined all fold to the e2e execution layer.
    default:
      return "e2e";
  }
}

function emptyLayerHealth(): LayerHealth {
  return { pass: 0, fail: 0, inconclusive: 0 };
}

/** Classify the pyramid shape from per-layer scenario counts (pure). */
export function classifyPyramid(counts: {
  unit: number;
  component: number;
  contract: number;
  e2e: number;
}): PyramidShape {
  const total = counts.unit + counts.component + counts.contract + counts.e2e;
  if (total === 0) return "empty";
  const middle = counts.component + counts.contract;
  const hasUnit = counts.unit > 0;
  const hasMiddle = middle > 0;
  const hasE2e = counts.e2e > 0;

  // Precedence: e2e-only → e2e-heavy; e2e+middle without unit → no-unit;
  // unit+e2e without middle → empty-middle; otherwise healthy.
  if (hasE2e && !hasUnit && !hasMiddle) return "e2e-heavy";
  if (hasE2e && hasMiddle && !hasUnit) return "no-unit";
  if (hasUnit && hasE2e && !hasMiddle) return "empty-middle";
  return "healthy";
}

export interface PyramidConfig {
  /** Max ratio of non-`@critical` e2e scenarios before the gate fires. */
  e2eRatioThreshold: number;
  /** When false, the ratio gate degrades to advisory (never blocks). */
  strictPyramid: boolean;
}

/**
 * Shared e2e-heavy detector (Req5 signal + Req7 gate reuse the same logic).
 * Pure; deterministic; no IO. Counts api/ui/cli/mixed as the e2e layer and
 * excludes the `@critical`-tagged e2e from the ratio (Req7 AC4).
 */
export function isE2eHeavy(
  scenarios: readonly { type: ScenarioType; tags: readonly string[] }[],
  config: PyramidConfig,
): boolean {
  const total = scenarios.length;
  if (total < 3) return false; // small-spec exemption (Req7 AC6)
  if (!config.strictPyramid || config.e2eRatioThreshold <= 0) return false;
  const e2eNonCritical = scenarios.filter(
    (s) => layerOf(s.type) === "e2e" && !s.tags.includes("@critical"),
  ).length;
  const middle = scenarios.filter((s) => ["unit", "component", "contract"].includes(s.type)).length;
  return e2eNonCritical / total > config.e2eRatioThreshold && middle === 0;
}

export function aggregateVerdicts(artifacts: readonly ScenarioArtifact[]): {
  pass: number;
  fail: number;
  skip: number;
  warn: number;
  inconclusive: number;
  blocksShip: boolean;
  layerHealth: LayerHealthBreakdown;
  pyramidShape: PyramidShape;
} {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  let warn = 0;
  let inconclusive = 0;

  const layerHealth: LayerHealthBreakdown = {
    unit: emptyLayerHealth(),
    component: emptyLayerHealth(),
    contract: emptyLayerHealth(),
    e2e: emptyLayerHealth(),
  };

  for (const a of artifacts) {
    switch (a.verdict) {
      case "PASS":
        pass++;
        break;
      case "FAIL":
        fail++;
        break;
      case "SKIP":
        skip++;
        break;
      case "WARN":
        warn++;
        break;
      case "INCONCLUSIVE":
        inconclusive++;
        break;
    }

    // Artifacts without a type (legacy) are not counted in any layer — they
    // still contribute to the flat counts above but have no pyramid home.
    if (a.type === undefined) continue;
    const layer = layerOf(a.type);
    const h = layerHealth[layer];
    if (a.verdict === "PASS") h.pass++;
    else if (a.verdict === "FAIL") h.fail++;
    else if (a.verdict === "INCONCLUSIVE") h.inconclusive++;
  }

  const pyramidShape = classifyPyramid({
    unit: layerHealth.unit.pass + layerHealth.unit.fail + layerHealth.unit.inconclusive,
    component:
      layerHealth.component.pass + layerHealth.component.fail + layerHealth.component.inconclusive,
    contract:
      layerHealth.contract.pass + layerHealth.contract.fail + layerHealth.contract.inconclusive,
    e2e: layerHealth.e2e.pass + layerHealth.e2e.fail + layerHealth.e2e.inconclusive,
  });

  // [Spec R2-AC3] INCONCLUSIVE does NOT increment fail and does NOT block ship.
  // pyramidShape is advisory (Req5 AC5) and never affects blocksShip.
  return { pass, fail, skip, warn, inconclusive, blocksShip: fail > 0, layerHealth, pyramidShape };
}

// Keep the unused import type referenced to satisfy linters when this module
// is imported standalone. (AcceptanceRunResult is re-exported for consumers
// that pair aggregateVerdicts with renderAcceptanceReport.)
export type { AcceptanceRunResult };
