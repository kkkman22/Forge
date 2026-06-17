/**
 * UI harness orchestrator — selects and runs the appropriate tier.
 *
 * 4-tier priority: project > agent-browser > playwright > cdp  [Spec R3-AC1]
 * (cmux-browser tier removed — superseded by agent-browser. [R3-AC2])
 * All tiers fail → INCONCLUSIVE [R6.8]
 *
 * **Validates: Requirements R6.2, R6.5, R6.6, R6.8**
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentBrowserCliClient } from "./agent-browser-client.js";
import { runCdpHarness } from "./harness-cdp.js";
import { detectAgentBrowser, detectProjectHarness } from "./harness-detector.js";
import { runPlaywrightHarness } from "./harness-playwright.js";

export type UiControllerTier = "project" | "agent-browser" | "playwright" | "cdp";

export interface UiHarnessOptions {
  topic: string;
  appUrl: string;
  designerSpecPath?: string;
  forgeDir?: string;
}

export interface UiHarnessVerdict {
  verdict: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE";
  controllerUsed: UiControllerTier | null;
  controllersAttempted: { tier: UiControllerTier; reason: string }[];
  artifactsDir: string;
}

export async function runUiHarness(opts: UiHarnessOptions): Promise<UiHarnessVerdict> {
  const attempted: { tier: UiControllerTier; reason: string }[] = [];
  const forgeDir = opts.forgeDir ?? join(process.cwd(), ".forge");
  const artifactsDir = join(forgeDir, "findings", opts.topic, "ui-harness");

  // Tier 1: Project harness
  const projectHarness = await detectProjectHarness("ui");
  if (projectHarness) {
    attempted.push({ tier: "project", reason: `Found: ${projectHarness}` });
    return writeResult(artifactsDir, {
      verdict: "INCONCLUSIVE",
      controllerUsed: "project",
      controllersAttempted: attempted,
      artifactsDir,
    });
  }
  attempted.push({ tier: "project", reason: "No project UI harness found" });

  // Tier 2: agent-browser (snapshot+refs CLI) [Spec R3-AC1, R3-AC4]
  const agentBrowserAvailable = await detectAgentBrowser();
  if (agentBrowserAvailable) {
    try {
      const client = new AgentBrowserCliClient();
      const sessionId = `forge-harness-${opts.topic}-${Date.now()}`;
      await client.open(opts.appUrl, sessionId);
      const snap = await client.snapshot(sessionId);
      await client.close(sessionId);
      // Page reachable + returned a snapshot → VERIFIED.
      attempted.push({
        tier: "agent-browser",
        reason: `snapshot ok (${snap.refs.length} refs, ${snap.url})`,
      });
      return writeResult(artifactsDir, {
        verdict: "VERIFIED",
        controllerUsed: "agent-browser",
        controllersAttempted: attempted,
        artifactsDir,
      });
    } catch (e) {
      attempted.push({
        tier: "agent-browser",
        reason: `execution failed: ${String((e as Error).message ?? e)}`,
      });
    }
  } else {
    attempted.push({ tier: "agent-browser", reason: "not installed" });
  }

  // Tier 3: playwright
  const pwResult = await runPlaywrightHarness({
    appUrl: opts.appUrl,
    designerSpecPath: opts.designerSpecPath,
  });
  if (pwResult.ok) {
    return writeResult(artifactsDir, {
      verdict: "VERIFIED",
      controllerUsed: "playwright",
      controllersAttempted: attempted,
      artifactsDir,
    });
  }
  attempted.push({ tier: "playwright", reason: pwResult.reason ?? "Playwright execution failed" });

  // Tier 4: CDP
  const cdpResult = await runCdpHarness({ appUrl: opts.appUrl });
  if (cdpResult.ok) {
    return writeResult(artifactsDir, {
      verdict: "VERIFIED",
      controllerUsed: "cdp",
      controllersAttempted: attempted,
      artifactsDir,
    });
  }
  attempted.push({ tier: "cdp", reason: cdpResult.reason ?? "CDP connection failed" });

  // All tiers failed [R6.8]
  return writeResult(artifactsDir, {
    verdict: "INCONCLUSIVE",
    controllerUsed: null,
    controllersAttempted: attempted,
    artifactsDir,
  });
}

function writeResult(artifactsDir: string, verdict: UiHarnessVerdict): UiHarnessVerdict {
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
