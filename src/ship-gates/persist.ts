/**
 * Ship gate — gate result persistence.
 *
 * Extracted from `ship-gates.ts` (god-file split, following the
 * `context-budget/` + `pua-engine/` precedent). See `ship-gates.ts` for the
 * re-export barrel that preserves the public API.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type EvidenceArtifact,
  hashEvidenceInput,
  writeEvidenceArtifact,
} from "../evidence-artifact.js";
import type { ShipGateReport } from "./types.js";

export interface PersistGateResultsOptions {
  projectRoot?: string;
  commit?: string;
  producer?: string;
  command?: string;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  createdAt?: string;
}

export interface PersistGateResultsResult {
  reportPath: string;
  artifactPath?: string;
  artifactError?: string;
}

/**
 * Persist gate results to .forge/ship/<run-id>-gates.json.
 *
 * Creates the directory if it does not exist.
 */
export function persistGateResults(
  report: ShipGateReport,
  shipDir: string,
  options: PersistGateResultsOptions = {},
): PersistGateResultsResult {
  mkdirSync(shipDir, { recursive: true });
  const filePath = join(shipDir, `${report.runId}-gates.json`);
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  const projectRoot = options.projectRoot ?? inferProjectRootFromShipDir(shipDir);
  if (!projectRoot) {
    return { reportPath: filePath };
  }

  const artifactId = `${report.runId}-ship-gate`;
  const artifact: EvidenceArtifact = {
    schema_version: 1,
    artifact_id: artifactId,
    kind: "ship_gate",
    topic: report.feature,
    run_id: report.runId,
    trace_id: report.runId,
    commit: options.commit ?? "unknown",
    command: options.command ?? `forge ship ${report.feature}`,
    exit_code: options.exitCode ?? (report.allPassed ? 0 : 1),
    input_hash: hashEvidenceInput(report),
    result: report.allPassed ? "pass" : "blocked",
    producer: options.producer ?? "forge-ship",
    created_at: options.createdAt ?? report.timestamp,
  };
  if (options.stdoutTail !== undefined) artifact.stdout_tail = options.stdoutTail;
  if (options.stderrTail !== undefined) artifact.stderr_tail = options.stderrTail;

  const writeResult = writeEvidenceArtifact(projectRoot, artifact);

  if (!writeResult.ok) {
    return { reportPath: filePath, artifactError: writeResult.message };
  }

  return { reportPath: filePath, artifactPath: writeResult.path };
}

function inferProjectRootFromShipDir(shipDir: string): string | null {
  if (basename(shipDir) !== "ship") return null;
  const forgeDir = dirname(shipDir);
  if (basename(forgeDir) !== ".forge") return null;
  return dirname(forgeDir);
}
