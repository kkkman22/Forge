/**
 * CLI harness orchestrator — selects and runs the appropriate tier.
 *
 * 4-tier priority: project > cmux > tmux > node-pty
 * All tiers fail → INCONCLUSIVE [R5.8]
 *
 * **Validates: Requirements R5.2, R5.3, R5.4, R5.8**
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCmuxHarness } from "./harness-cmux.js";
import {
  detectCmuxAvailable,
  detectProjectHarness,
  detectTmuxAvailable,
} from "./harness-detector.js";
import { runPtyHarness } from "./harness-pty.js";
import { runTmuxHarness } from "./harness-tmux.js";

export type ControllerTier = "project" | "cmux" | "tmux" | "node-pty";

export interface CliHarnessOptions {
  topic: string;
  targetCommand: string;
  inputScript?: string;
  forgeDir?: string;
}

export interface HarnessVerdict {
  verdict: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE";
  controllerUsed: ControllerTier | null;
  controllersAttempted: { tier: ControllerTier; reason: string }[];
  artifactsDir: string;
}

export async function runCliHarness(opts: CliHarnessOptions): Promise<HarnessVerdict> {
  const attempted: { tier: ControllerTier; reason: string }[] = [];
  const forgeDir = opts.forgeDir ?? join(process.cwd(), ".tinkerman");
  const artifactsDir = join(forgeDir, "findings", opts.topic, "cli-harness");

  // Tier 1: Project harness
  const projectHarness = await detectProjectHarness("cli");
  if (projectHarness) {
    attempted.push({ tier: "project", reason: `Found: ${projectHarness}` });
    // Project harness means the project has its own e2e framework
    // The orchestrator records this but execution is handled externally
    return writeResult(artifactsDir, {
      verdict: "INCONCLUSIVE",
      controllerUsed: "project",
      controllersAttempted: attempted,
      artifactsDir,
    });
  }
  attempted.push({ tier: "project", reason: "No project e2e harness found" });

  // Tier 2: cmux
  const cmuxAvailable = await detectCmuxAvailable();
  if (cmuxAvailable) {
    const result = await runCmuxHarness({
      targetCommand: opts.targetCommand,
      inputScript: opts.inputScript,
    });
    if (result.ok) {
      return writeResult(artifactsDir, {
        verdict: result.exitCode === 0 ? "VERIFIED" : "NOT_VERIFIED",
        controllerUsed: "cmux",
        controllersAttempted: attempted,
        artifactsDir,
      });
    }
    attempted.push({ tier: "cmux", reason: result.reason ?? "cmux execution failed" });
  } else {
    attempted.push({ tier: "cmux", reason: "cmux not available" });
  }

  // Tier 3: tmux
  const tmuxAvailable = detectTmuxAvailable();
  if (tmuxAvailable) {
    const result = runTmuxHarness({
      targetCommand: opts.targetCommand,
      inputScript: opts.inputScript,
    });
    if (result.ok) {
      return writeResult(artifactsDir, {
        verdict: (result.exitCode ?? 1) === 0 ? "VERIFIED" : "NOT_VERIFIED",
        controllerUsed: "tmux",
        controllersAttempted: attempted,
        artifactsDir,
      });
    }
    attempted.push({ tier: "tmux", reason: result.reason ?? "tmux execution failed" });
  } else {
    attempted.push({ tier: "tmux", reason: "tmux not available" });
  }

  // Tier 4: node-pty (spawn + pipe)
  try {
    const result = await runPtyHarness({
      targetCommand: opts.targetCommand,
      inputScript: opts.inputScript,
    });
    if (result.ok) {
      return writeResult(artifactsDir, {
        verdict: result.exitCode === 0 ? "VERIFIED" : "NOT_VERIFIED",
        controllerUsed: "node-pty",
        controllersAttempted: attempted,
        artifactsDir,
      });
    }
    attempted.push({ tier: "node-pty", reason: result.reason ?? "PTY execution failed" });
  } catch (error) {
    attempted.push({
      tier: "node-pty",
      reason: `PTY error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // All tiers failed [R5.8]
  return writeResult(artifactsDir, {
    verdict: "INCONCLUSIVE",
    controllerUsed: null,
    controllersAttempted: attempted,
    artifactsDir,
  });
}

function writeResult(artifactsDir: string, verdict: HarnessVerdict): HarnessVerdict {
  try {
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(
      join(artifactsDir, "controllers-attempted.json"),
      JSON.stringify(verdict.controllersAttempted, null, 2),
    );
    writeFileSync(
      join(artifactsDir, "verdict.md"),
      `---\nverdict: ${verdict.verdict}\ncontroller: ${verdict.controllerUsed ?? "none"}\n---\n`,
    );
  } catch (_err: unknown) {
    // Artifact write failure is non-fatal
  }
  return verdict;
}
