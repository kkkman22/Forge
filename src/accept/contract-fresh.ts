/**
 * Contract-freshness check — extracted from accept-driver.ts (P3-1).
 *
 * Determines whether a contract artifact (codegen output) is fresh relative to
 * its source spec. Pure aside from the existence/mtime reads.
 *
 * Originally lines 469-519 + 613-616 of accept-driver.ts.
 */

import type { statSync as StatSyncFn } from "node:fs";
import type { Scenario } from "../accept.js";

export type ContractSource = "openapi" | "pont" | "pact" | "manual";

export interface ContractFreshInput {
  source: ContractSource;
  artifactPath: string;
  /** Optional: the swagger/schema source to compare mtime against (pont/openapi). */
  swaggerSourcePath?: string | null;
}

export interface ContractFreshResult {
  fresh: boolean;
  reason?: string;
}

/**
 * Check whether a contract artifact (codegen output) is fresh (Req3 AC7/AC8).
 * Pure aside from the existence/mtime reads needed to judge freshness.
 *   - manual/pact: freshness is the consumer test's job → always fresh here.
 *   - openapi/pont: artifact must exist; if a swagger source is given and is
 *     newer than the artifact → stale (rerun generate).
 */
export function checkContractFresh(input: ContractFreshInput): ContractFreshResult {
  const { source } = input;
  if (source === "manual" || source === "pact") {
    return { fresh: true };
  }
  // openapi / pont: the artifact is a codegen product; verify it exists.
  try {
    const { statSync } = require("node:fs") as typeof import("node:fs");
    const artifactStat = (statSync as typeof StatSyncFn)(input.artifactPath);
    if (input.swaggerSourcePath) {
      try {
        const swaggerStat = (statSync as typeof StatSyncFn)(input.swaggerSourcePath);
        if (swaggerStat.mtimeMs > artifactStat.mtimeMs) {
          return {
            fresh: false,
            reason: `stale contract: ${input.artifactPath} older than ${input.swaggerSourcePath} — rerun pont generate`,
          };
        }
      } catch {
        // swagger source missing → can't compare; treat artifact as fresh.
      }
    }
    return { fresh: true };
  } catch {
    return {
      fresh: false,
      reason: `stale contract: ${input.artifactPath} missing — rerun pont generate`,
    };
  }
}

/**
 * Read the contract source declaration from a scenario's raw text.
 * Extracted from accept-driver.ts (was private); now exported so
 * makeDelegateRunner in accept-driver.ts can import it.
 */
export function readContractSource(scenario: Scenario): ContractSource {
  const m = scenario.rawText.match(/Contract-Source:\s*(\w+)/i);
  return (m?.[1] as ContractSource) ?? "manual";
}
