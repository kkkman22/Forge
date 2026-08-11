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
import { AgentBrowserCliClient, type AgentBrowserClient } from "./agent-browser-client.js";
import { type CdpHarnessOptions, type CdpHarnessResult, runCdpHarness } from "./harness-cdp.js";
import { detectAgentBrowser, detectProjectHarness } from "./harness-detector.js";
import {
  type PlaywrightHarnessOptions,
  type PlaywrightHarnessResult,
  runPlaywrightHarness,
} from "./harness-playwright.js";

export type UiControllerTier = "project" | "agent-browser" | "playwright" | "cdp";

export interface UiHarnessOptions {
  topic: string;
  appUrl: string;
  designerSpecPath?: string;
  forgeDir?: string;
  /**
   * Test seam: override agent-browser availability detection.
   * Default = real `detectAgentBrowser` (shells out to `which agent-browser`).
   * Production callers never set this.
   */
  detectAgentBrowser?: () => Promise<boolean>;
  /**
   * Test seam: factory for the agent-browser client.
   * Default = `() => new AgentBrowserCliClient()` (launches real headless Chrome).
   * Production callers never set this.
   */
  agentBrowserClientFactory?: () => AgentBrowserClient;
  /**
   * Test seam: override the Playwright tier adapter.
   * Default = real `runPlaywrightHarness`.
   */
  playwrightRunner?: (opts: PlaywrightHarnessOptions) => Promise<PlaywrightHarnessResult>;
  /**
   * Test seam: override the CDP tier adapter.
   * Default = real `runCdpHarness`.
   */
  cdpRunner?: (opts: CdpHarnessOptions) => Promise<CdpHarnessResult>;
}

export interface UiHarnessVerdict {
  verdict: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE";
  controllerUsed: UiControllerTier | null;
  controllersAttempted: { tier: UiControllerTier; reason: string }[];
  artifactsDir: string;
}

export async function runUiHarness(opts: UiHarnessOptions): Promise<UiHarnessVerdict> {
  const attempted: { tier: UiControllerTier; reason: string }[] = [];
  const forgeDir = opts.forgeDir ?? join(process.cwd(), ".tinkerman");
  const artifactsDir = join(forgeDir, "findings", opts.topic, "ui-harness");

  // Test seams — default to the real implementations. Production code never
  // injects these; tests pass fakes to avoid launching real browsers.
  const detectAb = opts.detectAgentBrowser ?? detectAgentBrowser;
  const makeClient = opts.agentBrowserClientFactory ?? (() => new AgentBrowserCliClient());
  const runPlaywright = opts.playwrightRunner ?? runPlaywrightHarness;
  const runCdp = opts.cdpRunner ?? runCdpHarness;

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
  const agentBrowserAvailable = await detectAb();
  if (agentBrowserAvailable) {
    const client = makeClient();
    const sessionId = `forge-harness-${opts.topic}-${Date.now()}`;
    let opened = false;
    try {
      await client.open(opts.appUrl, sessionId);
      opened = true;
      const snap = await client.snapshot(sessionId);
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
    } finally {
      // close() MUST run even when snapshot/open throws — otherwise the
      // agent-browser daemon forked by `open` is orphaned and leaks one
      // process + socket per failed run. (Regression: 251 daemons observed.)
      if (opened) {
        try {
          await client.close(sessionId);
        } catch {
          // close failure is non-fatal; the tier already recorded its result.
        }
      }
    }
  } else {
    attempted.push({ tier: "agent-browser", reason: "not installed" });
  }

  // Tier 3: playwright
  const pwResult = await runPlaywright({
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
  const cdpResult = await runCdp({ appUrl: opts.appUrl });
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
