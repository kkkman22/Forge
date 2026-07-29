/**
 * Acceptance driver — runner dispatch + barrel re-exports.
 *
 * This file is now a slim re-export barrel + the api/cli runners. The bulk of
 * the implementations live in the `accept/` submodules (god-file split, P3-1 +
 * this pass, following the `context-budget/`, `pua-engine/`, `ship-gates/`
 * precedent). All public exports are re-exported here so existing
 * `import { … } from "../accept-driver.js"` callers (14 test files + scripts)
 * keep working unchanged.
 *
 * Cycle discipline: submodules import shared types/helpers from the leaf
 * `accept/artifact.ts` (RunnerContext/Runner/makeArtifact), NEVER from this
 * barrel. This barrel is one-directional: it imports from submodules, never
 * the reverse.
 */

import type { Runner, RunnerContext } from "./accept/artifact.js";
import { makeArtifact } from "./accept/artifact.js";
import { componentRunner, contractRunner, unitRunner } from "./accept/delegate-runners.js";
import {
  buildCurlArgs,
  evaluateApiVerdict,
  evaluateApiVerdictWithBody,
  evaluateCliVerdict,
  execDescriptor,
  extractCommand,
  extractEndpoint,
  extractMethod,
} from "./accept/http-probe.js";
import { agentBrowserRunner, extractActionKeyword } from "./accept/ui-runner.js";
import type { Scenario, ScenarioArtifact } from "./accept.js";

// ---------------------------------------------------------------------------
// Shared runner types — defined in the leaf `accept/artifact.ts` so submodules
// can import them without a barrel↔submodule cycle. Re-exported for stability.
// ---------------------------------------------------------------------------

export type { Runner, RunnerContext } from "./accept/artifact.js";

// ---------------------------------------------------------------------------
// API Runner
// ---------------------------------------------------------------------------

export const apiRunner: Runner = {
  type: "api",
  supports: (scenario) => scenario.type === "api",
  run: async (scenario, ctx) => {
    const endpoint = extractEndpoint(scenario.given || scenario.when);
    if (!endpoint) {
      return makeArtifact(scenario, ctx, "SKIP", [], "no endpoint found in scenario");
    }

    try {
      const method = extractMethod(scenario.when);
      // endpoint may be a relative path (e.g. /api/login); resolve to full URL.
      const base = ctx.appUrl ?? "http://localhost:5173";
      const url = /^https?:\/\//i.test(endpoint)
        ? endpoint
        : `${base}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
      // Req4: when the THEN clause asserts on data.<path>, keep the body so
      // evaluateApiVerdictWithBody can check field values (not just status).
      const wantsBody = /data\.\w/i.test(scenario.then);
      const d = buildCurlArgs(method, url, { assertBody: wantsBody });
      const result = await execDescriptor(d);

      if (wantsBody) {
        const apiResult = evaluateApiVerdictWithBody(result, scenario.then);
        // Req4 AC6: never write the full body to the artifact — only the
        // matched path:value summary (may contain sensitive data otherwise).
        const evidence = apiResult.bodySummary ? [apiResult.bodySummary] : [];
        return makeArtifact(scenario, ctx, apiResult.verdict, evidence, apiResult.failureReason);
      }
      const verdict = evaluateApiVerdict(result, scenario.then);
      return makeArtifact(scenario, ctx, verdict, [result.stdout], undefined);
    } catch (e) {
      // Environment-level failure (curl crash/network) → INCONCLUSIVE. [T3.2]
      return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], String(e));
    }
  },
};

// ---------------------------------------------------------------------------
// CLI Runner
// ---------------------------------------------------------------------------

export const cliRunner: Runner = {
  type: "cli",
  supports: (scenario) => scenario.type === "cli",
  run: async (scenario, ctx) => {
    const command = extractCommand(scenario.when);
    if (!command) {
      return makeArtifact(scenario, ctx, "SKIP", [], "no command found in scenario");
    }

    try {
      const parts = command.split(/\s+/).filter(Boolean);
      const d = { executable: parts[0], args: parts.slice(1) };
      const result = await execDescriptor(d);
      const verdict = evaluateCliVerdict(result, scenario.then);
      return makeArtifact(scenario, ctx, verdict, [result.stdout, result.stderr], undefined);
    } catch (e) {
      // Environment-level failure → INCONCLUSIVE. [T3.2]
      return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], String(e));
    }
  },
};

// ---------------------------------------------------------------------------
// Runner Dispatch
// ---------------------------------------------------------------------------

export type { DelegateConfig, DelegateLayer } from "./accept/delegate-runners.js";
export {
  componentRunner,
  contractRunner,
  recipeHint,
  resolveTestCommand,
  unitRunner,
} from "./accept/delegate-runners.js";
export { agentBrowserRunner, extractActionKeyword };

export const RUNNERS: readonly Runner[] = [
  unitRunner,
  componentRunner,
  contractRunner,
  apiRunner,
  agentBrowserRunner,
  cliRunner,
];

export async function runScenario(
  scenario: Scenario,
  ctx: RunnerContext,
): Promise<ScenarioArtifact> {
  const runner = RUNNERS.find((r) => r.supports(scenario));
  if (!runner) {
    return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], "no runner available for scenario type");
  }
  return runner.run(scenario, ctx);
}

// ---------------------------------------------------------------------------
// Aggregation / report — moved to ./accept/pyramid.js + ./accept/report.js.
// ---------------------------------------------------------------------------

export type {
  LayerHealth,
  LayerHealthBreakdown,
  PyramidConfig,
  PyramidShape,
} from "./accept/pyramid.js";
export { aggregateVerdicts, classifyPyramid, isE2eHeavy, layerOf } from "./accept/pyramid.js";

export { renderAcceptanceReport } from "./accept/report.js";

// ---------------------------------------------------------------------------
// P3-1: contract-fresh symbols (ContractSource/ContractFreshInput/
// ContractFreshResult/checkContractFresh) moved to ./accept/contract-fresh.js.
// Re-exported here for backward compatibility with existing importers.
// ---------------------------------------------------------------------------

export type {
  ContractFreshInput,
  ContractFreshResult,
  ContractSource,
} from "./accept/contract-fresh.js";
export { checkContractFresh } from "./accept/contract-fresh.js";

// ---------------------------------------------------------------------------
// P3-1: http-probe symbols (extract*/buildCurl*/evaluate*Verdict*/execDescriptor/
// splitBodyAndStatus/matchJsonPath/redactBody/BodyMatch/ApiVerdictResult/ExecResult)
// moved to ./accept/http-probe.js. Re-exported here for backward compatibility
// with existing importers (apiRunner/cliRunner/makeDelegateRunner + tests).
// ---------------------------------------------------------------------------

export type { ApiVerdictResult, BodyMatch, ExecResult } from "./accept/http-probe.js";
export {
  buildCurlArgs,
  buildCurlCommand,
  evaluateApiVerdictWithBody,
  evaluateCliVerdict,
  execDescriptor,
  extractCommand,
  extractEndpoint,
  extractMethod,
  matchJsonPath,
  redactBody,
  splitBodyAndStatus,
} from "./accept/http-probe.js";
