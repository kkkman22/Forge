/**
 * Pyramid ratio gate (ADR-0006 Req7) — entry point + pure helpers.
 *
 * The shell wrapper scripts/check-pyramid-ratio.sh invokes this via tsx so the
 * gate shares the exact `isE2eHeavy` judgement used by aggregateVerdicts (Req5
 * signal) and the spec contract (Req1 layer routing) — one source of truth for
 * "is this spec E2E-heavy", no logic drift.
 *
 * Input: a spec requirements.md document. The gate counts Acceptance Criteria
 * by their `Verify-By: <layer>` annotation:
 *   - e2e layer = forge_exec:e2e
 *   - middle    = vitest:component / bash:contract
 *   - unit      = vitest:unit
 *   - @critical ACs are excluded from the e2e ratio (Req7 AC4)
 *   - total < 3 → skip (Req7 AC6, small-spec exemption)
 *   - strict_pyramid: false / e2e_ratio_threshold: 0 → warn-only (Req7 AC3)
 */
import { readFileSync } from "node:fs";
import { isE2eHeavy, type PyramidConfig } from "../src/accept-driver.js";
import {
  extractAcceptanceCriteria,
  parseVerifyByLayer,
} from "../src/contract-validator.js";

export interface PyramidRatioInput {
  /** AC id → Verify-By layer (null when missing/illegal). */
  criteria: readonly { id: string; layer: string | null; critical: boolean }[];
  config: PyramidConfig;
}

export interface PyramidRatioResult {
  total: number;
  e2eNonCritical: number;
  middle: number;
  unit: number;
  heavy: boolean;
  skip: boolean;
  skipReason?: string;
}

/** Pure gate logic — reuses isE2eHeavy so the gate and the signal never drift. */
export function evaluatePyramidRatio(input: PyramidRatioInput): PyramidRatioResult {
  const total = input.criteria.length;
  if (total < 3) {
    return { total, e2eNonCritical: 0, middle: 0, unit: 0, heavy: false, skip: true, skipReason: "total < 3 (small-spec exemption)" };
  }
  const e2eNonCritical = input.criteria.filter(
    (c) => c.layer === "e2e" && !c.critical,
  ).length;
  const middle = input.criteria.filter(
    (c) => c.layer === "component" || c.layer === "contract",
  ).length;
  const unit = input.criteria.filter((c) => c.layer === "unit").length;

  // Reuse the shared detector: shape scenarios in its expected form.
  const heavy = isE2eHeavy(
    input.criteria.map((c) => ({
      type: (c.layer === "unit"
        ? "unit"
        : c.layer === "component"
          ? "component"
          : c.layer === "contract"
            ? "contract"
            : "api") as never,
      tags: c.critical ? ["@critical"] : [],
    })),
    input.config,
  );

  let skip = false;
  let skipReason: string | undefined;
  if (!input.config.strictPyramid) {
    skip = true;
    skipReason = "strict_pyramid: false (warn-only)";
  } else if (input.config.e2eRatioThreshold <= 0) {
    skip = true;
    skipReason = "e2e_ratio_threshold: 0 (gate disabled)";
  }

  return { total, e2eNonCritical, middle, unit, heavy, skip, skipReason };
}

/** Detect @critical tag in an AC's raw text (heuristic — looks for the tag). */
export function isCriticalAc(rawText: string): boolean {
  return /@critical\b/i.test(rawText);
}

/** Parse a spec requirements.md into the gate's input shape. */
export function parseSpecForRatio(
  specMarkdown: string,
  config: PyramidConfig,
): PyramidRatioInput {
  const criteria = extractAcceptanceCriteria(specMarkdown).map((ac) => ({
    id: ac.id,
    layer: parseVerifyByLayer(ac.verifyBy),
    critical: isCriticalAc(ac.text),
  }));
  return { criteria, config };
}

function readConfig(projectRoot: string): PyramidConfig {
  const defaults: PyramidConfig = { e2eRatioThreshold: 0.3, strictPyramid: true };
  try {
    const cfg = readFileSync(`${projectRoot}/.tinkerman/config.md`, "utf8");
    const thr = cfg.match(/e2e_ratio_threshold:\s*([0-9.]+)/);
    const strict = cfg.match(/strict_pyramid:\s*(true|false)/i);
    if (thr) defaults.e2eRatioThreshold = Number.parseFloat(thr[1]);
    if (strict) defaults.strictPyramid = strict[1].toLowerCase() === "true";
  } catch {
    // config absent → defaults
  }
  return defaults;
}

// CLI entry (invoked by scripts/check-pyramid-ratio.sh). Guarded so the module
// is importable from tests without triggering the argv-driven main.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const specFile = process.argv[2];
  if (!specFile) {
    console.error("Usage: check-pyramid-ratio.ts <spec-requirements.md>");
    process.exit(2);
  }
  const projectRoot = process.argv[3] ?? process.cwd();
  const spec = readFileSync(specFile, "utf8");
  const input = parseSpecForRatio(spec, readConfig(projectRoot));
  const result = evaluatePyramidRatio(input);

  if (result.skip) {
    console.log(
      `OK: pyramid ratio skipped — ${result.skipReason} (total=${result.total}, e2e=${result.e2eNonCritical}, middle=${result.middle}, unit=${result.unit})`,
    );
    process.exit(0);
  }
  if (result.heavy) {
    const ratio = result.total > 0 ? (result.e2eNonCritical / result.total).toFixed(2) : "0";
    console.error(
      `❌ E2E-heavy anti-pattern: e2e(non-critical) ratio ${ratio} > ${input.config.e2eRatioThreshold}, middle=${result.middle}, unit=${result.unit}`,
    );
    console.error("   将组合下沉到 component 层 (vitest:component) — /tinkerman init --recipe");
    process.exit(1);
  }
  console.log(
    `OK: pyramid ratio healthy (total=${result.total}, e2e=${result.e2eNonCritical}, middle=${result.middle}, unit=${result.unit})`,
  );
  process.exit(0);
}
