#!/usr/bin/env node
/**
 * browser-qa.mjs — Browser QA fallback using cmux browser commands (R8).
 * Drives end-to-end QA via `cmux browser` command set.
 * Three-state verdict: pass / fail / inconclusive.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cmuxAvailable } from "./lib/availability.mjs";
import { runCli } from "./lib/cli.mjs";
import {
  buildConsoleArgs,
  buildErrorsArgs,
  buildScreenshotArgs,
  injectSurface,
} from "./lib/browser-q-actions.mjs";

const QA_STEPS = [
  { name: "navigate", args: ["browser", "navigate", "about:blank"] },
  { name: "evaluate", args: ["browser", "evaluate", "document.readyState"] },
  { name: "screenshot", args: ["browser", "screenshot"] },
];

// S1: confine the `topic` path segment in collectBrowserDiagnostics so a
// caller-supplied topic cannot traverse out of forgeDir.
const SAFE_TOPIC = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Run browser QA sequence (R8.1–R8.9).
 * Returns { verdict, failures, steps, timestamp }.
 * Never throws (R8.8).
 */
export async function runBrowserQa({
  forgeDir = ".tinkerman",
  writeArtifact = false,
  steps = QA_STEPS,
} = {}) {
  const result = {
    verdict: "inconclusive" /* pass | fail | inconclusive */,
    failures: [],
    steps: [],
    timestamp: new Date().toISOString(),
  };

  try {
    // R8.1: cmux unavailable → inconclusive
    if (!cmuxAvailable()) {
      return result;
    }

    for (const step of steps) {
      const stepResult = { name: step.name, status: "pending" };

      try {
        const cliResult = await runCli(step.args, { timeoutMs: 10000 });

        // R8.6: EPIPE / null result → inconclusive
        if (cliResult === null) {
          result.verdict = "inconclusive";
          stepResult.status = "skipped";
          result.steps.push(stepResult);
          return result;
        }

        if (cliResult.exitCode === 0) {
          stepResult.status = "pass";
        } else {
          // R8.2: "unknown command" in stderr means browser unsupported → inconclusive
          const errText = (cliResult.stderr ?? "") + (cliResult.stdout ?? "");
          if (/unknown command|not found|unsupported/i.test(errText)) {
            result.verdict = "inconclusive";
            stepResult.status = "skipped";
            result.steps.push(stepResult);
            return result;
          }
          stepResult.status = "fail";
          result.verdict = "fail";
          result.failures.push({
            step: step.name,
            stderr: (cliResult.stderr ?? "").slice(0, 200),
          });
        }
      } catch {
        stepResult.status = "error";
        result.verdict = "inconclusive";
      }

      result.steps.push(stepResult);

      if (result.verdict === "fail") break;
    }

    // R8.3: all passed
    if (result.verdict !== "fail" && result.steps.every((s) => s.status === "pass")) {
      result.verdict = "pass";
    }

    // R8.5: write verdict artifact
    if (writeArtifact && existsSync(forgeDir)) {
      const artifactPath = join(forgeDir, ".cmux-browser-qa.json");
      writeFileSync(artifactPath, JSON.stringify(result, null, 2));
    }
  } catch {
    // R8.8: never throw
    result.verdict = "inconclusive";
  }

  return result;
}

/**
 * Collect read-only browser QA diagnostics: screenshot + console log + JS errors.
 * Writes artifacts under `<forgeDir>/findings/<topic>/browser-qa/`.
 *
 * Grounded on `cmux browser` CLI (0.64.8 screenshot, 0.64.15 console/errors).
 * Zero-Impact: no-op when cmux is unavailable or forgeDir is missing; each step
 * degrades independently ("unsupported" / "failed" / "error") without aborting
 * the others. Never throws.
 *
 * @param {{ forgeDir?: string, topic?: string, surface?: string, runCli?: Function }} opts
 * @returns {Promise<{ collected: string[], skipped: Array<{kind:string,reason:string,stderr?:string}>, dir: string|null, timestamp: string }>}
 */
export async function collectBrowserDiagnostics({
  forgeDir = ".tinkerman",
  topic = "default",
  surface,
  runCli: run = runCli,
} = {}) {
  const result = {
    collected: [],
    skipped: [],
    dir: null,
    timestamp: new Date().toISOString(),
  };

  try {
    if (!cmuxAvailable()) return result;
    if (!existsSync(forgeDir)) return result;

    // S1: confine `topic` so a caller-supplied value cannot escape forgeDir via
    // path traversal (e.g. "../../etc" or an absolute path). Fall back to
    // "default" on any violation — never throw (preserves the never-throws R8.8
    // contract). outPath is already guarded in buildScreenshotArgs; this closes
    // the asymmetry on the `topic` segment of the same path.
    const safeTopic =
      typeof topic === "string" && SAFE_TOPIC.test(topic) ? topic : "default";

    const dir = join(forgeDir, "findings", safeTopic, "browser-qa");
    mkdirSync(dir, { recursive: true });
    result.dir = dir;

    const shotPath = join(dir, "screenshot.png");
    // Each step: argv tail from a builder, the artifact filename, and whether
    // we capture cmux stdout into a file (screenshot writes via --out itself).
    const steps = [
      { kind: "screenshot", args: buildScreenshotArgs({ outPath: shotPath }), capture: null },
      { kind: "console", args: buildConsoleArgs(), capture: "console.txt" },
      { kind: "errors", args: buildErrorsArgs(), capture: "errors.txt" },
    ];

    for (const step of steps) {
      try {
        const cliResult = await run(injectSurface(step.args, surface), {
          timeoutMs: 10000,
        });

        if (cliResult === null) {
          result.skipped.push({ kind: step.kind, reason: "no_cmux" });
          continue;
        }
        if (cliResult.exitCode !== 0) {
          const errText = (cliResult.stderr ?? "") + (cliResult.stdout ?? "");
          if (/unknown command|not found|unsupported/i.test(errText)) {
            result.skipped.push({ kind: step.kind, reason: "unsupported" });
          } else {
            result.skipped.push({
              kind: step.kind,
              reason: "failed",
              stderr: (cliResult.stderr ?? "").slice(0, 200),
            });
          }
          continue;
        }

        if (step.capture) {
          writeFileSync(join(dir, step.capture), cliResult.stdout ?? "");
        }
        result.collected.push(step.kind);
      } catch {
        result.skipped.push({ kind: step.kind, reason: "error" });
      }
    }
  } catch {
    // R8.8-style: never throw
  }

  return result;
}

// CLI entry point (runBrowserQa)
const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== "--test") {
  const forgeDir = args[0] || ".tinkerman";
  if (forgeDir.includes("..")) {
    process.exit(1);
  }
  runBrowserQa({ forgeDir, writeArtifact: true })
    .then((result) => {
      console.log(JSON.stringify(result));
      process.exit(result.verdict === "pass" ? 0 : 1);
    })
    .catch(() => process.exit(1));
}
