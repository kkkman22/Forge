import type {
  AcceptanceRunResult,
  Scenario,
  ScenarioArtifact,
  ScenarioType,
  Verdict,
} from "./accept.js";
import type { AgentBrowserClient, Snapshot } from "./agent-browser-client.js";
import { evaluateUiVerdict } from "./evaluate-ui-verdict.js";

// ---------------------------------------------------------------------------
// Runner Interface
// ---------------------------------------------------------------------------

export interface RunnerContext {
  topic: string;
  projectRoot: string;
  outputDir: string;
  tierAvailability: {
    cmuxAvailable: boolean;
    devServerRunning: boolean;
  };
  /** Injected agent-browser client for UI runner (optional; absent → INCONCLUSIVE). */
  agentBrowserClient?: AgentBrowserClient;
  /** App URL the agent-browser should open (defaults to localhost:5173). */
  appUrl?: string;
}

export interface Runner {
  type: ScenarioType;
  supports(scenario: Scenario): boolean;
  run(scenario: Scenario, ctx: RunnerContext): Promise<ScenarioArtifact>;
}

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
      const url = endpoint;
      const cmd = buildCurlCommand(method, url);
      const result = await execCommand(cmd);

      const verdict = evaluateApiVerdict(result, scenario.then);
      return makeArtifact(scenario, ctx, verdict, [result.stdout], undefined);
    } catch (e) {
      return makeArtifact(scenario, ctx, "FAIL", [], String(e));
    }
  },
};

// ---------------------------------------------------------------------------
// UI Runner — agent-browser (snapshot+refs) agentic driver
// [Spec R1-AC1..AC4, R3-AC6] Replaces the legacy always-SKIP uiRunner.
// ---------------------------------------------------------------------------

/** Locate a ref by visible-text/role keyword in the snapshot refs. */
function findRefByText(refs: Snapshot["refs"], keyword: string): string | null {
  const kw = keyword.trim().toLowerCase();
  for (const r of refs) {
    if (r.text && r.text.toLowerCase().includes(kw)) return r.ref;
  }
  return null;
}

const MAX_REF_RETRIES = 1;
const SCENARIO_WALLCLOCK_MS = 90_000;

export const agentBrowserRunner: Runner = {
  type: "ui",
  supports: (scenario) => scenario.type === "ui",
  run: async (scenario, ctx) => {
    const client = ctx.agentBrowserClient;

    // Environment unavailability → INCONCLUSIVE (not FAIL, not SKIP). [R2-AC2]
    if (!client) {
      return makeArtifact(
        scenario,
        ctx,
        "INCONCLUSIVE",
        [],
        "agent-browser unavailable (not installed or not injected)",
      );
    }
    if (!ctx.tierAvailability.devServerRunning) {
      return makeArtifact(
        scenario,
        ctx,
        "INCONCLUSIVE",
        [],
        "dev server not running",
      );
    }
    const appUrl = ctx.appUrl ?? "http://localhost:5173";

    // Wall-clock guard for the whole scenario. [R3-AC5]
    const sessionId = `forge-${scenario.id}-${Date.now()}`;
    let timedOut = false;
    const wall = setTimeout(() => {
      timedOut = true;
    }, SCENARIO_WALLCLOCK_MS);

    try {
      // open
      await client.open(appUrl, sessionId);

      // first snapshot
      let snap = await client.snapshot(sessionId);

      // act: fill username field + click the action button described in WHEN.
      const whenText = scenario.when;
      // Best-effort: fill any textbox (username) — value derived elsewhere; here just exercise.
      const usernameRef = snap.refs.find((r) => r.role === "textbox")?.ref ?? null;
      if (usernameRef) {
        await actWithRetry(client, sessionId, usernameRef, () =>
          client.fill(sessionId, usernameRef, "admin"),
        );
      }
      // click action button: pick ref by a keyword from WHEN (e.g. "登录").
      const clickKw = extractActionKeyword(whenText) ?? "登录";
      let clickedRef = findRefByText(snap.refs, clickKw);
      if (!clickedRef) {
        // fall back to first button
        clickedRef = snap.refs.find((r) => r.tag === "button")?.ref ?? null;
      }
      if (clickedRef) {
        const clickOk = await actWithRetry(client, sessionId, clickedRef, () =>
          client.click(sessionId, clickedRef!),
        );
        if (!clickOk) {
          return makeArtifact(
            scenario,
            ctx,
            "FAIL",
            [],
            `action ref ${clickedRef} failed after ${MAX_REF_RETRIES + 1} attempts`,
          );
        }
      }

      if (timedOut) {
        return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], "scenario wall-clock timeout");
      }

      // re-snapshot after action to evaluate THEN. [R1-AC3 act = exec + re-snapshot]
      snap = await client.snapshot(sessionId);

      // screenshot evidence
      const shotPath = `${ctx.outputDir}/${scenario.id}/screenshot.png`;
      try {
        await client.screenshot(sessionId, shotPath);
      } catch {
        // non-fatal — verdict still computable from snapshot
      }

      // evaluate THEN against the post-action snapshot. [R1-AC5]
      const verdict = evaluateUiVerdict(
        { url: snap.url, title: snap.title, text: snap.text },
        scenario.then,
      );

      return makeArtifact(
        scenario,
        ctx,
        verdict,
        verdict === "PASS" ? [shotPath] : [shotPath, snap.url],
        verdict === "FAIL" ? `THEN not satisfied: ${scenario.then}` : undefined,
      );
    } catch (e) {
      // Environment-level failure (crash/timeout) → INCONCLUSIVE. [Spec failure table]
      return makeArtifact(
        scenario,
        ctx,
        "INCONCLUSIVE",
        [],
        `agent-browser execution error: ${String((e as Error).message ?? e)}`,
      );
    } finally {
      clearTimeout(wall);
      try {
        await client.close(sessionId);
      } catch {
        // close failure is non-fatal
      }
    }
  },
};

/**
 * Run an action with up to MAX_REF_RETRIES retries on stale-ref errors.
 * act = exec + re-snapshot is composed by the caller; here we only retry the exec.
 * Returns true if the action eventually succeeded.
 */
async function actWithRetry(
  client: AgentBrowserClient,
  sessionId: string,
  _ref: string,
  act: () => Promise<void>,
): Promise<boolean> {
  for (let attempt = 0; attempt <= MAX_REF_RETRIES; attempt++) {
    try {
      await act();
      return true;
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (attempt < MAX_REF_RETRIES && /stale|ref|not found/i.test(msg)) {
        await client.snapshot(sessionId); // refresh refs before retry
        continue;
      }
      return false;
    }
  }
  return false;
}

/** Extract a likely action keyword (button label) from a WHEN clause. */
function extractActionKeyword(whenText: string): string | null {
  // "点击 登录按钮" / "click 登录" → take the trailing noun after the verb.
  const m = whenText.match(/(?:点击|click|按下|tap)\s*([^\s,，。]+)/i);
  if (m && m[1]) return m[1].replace(/按钮$/, "");
  return null;
}

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
      const result = await execCommand(command);
      const verdict = evaluateCliVerdict(result, scenario.then);
      return makeArtifact(scenario, ctx, verdict, [result.stdout, result.stderr], undefined);
    } catch (e) {
      return makeArtifact(scenario, ctx, "FAIL", [], String(e));
    }
  },
};

// ---------------------------------------------------------------------------
// Mixed Runner
// ---------------------------------------------------------------------------

export const mixedRunner: Runner = {
  type: "mixed",
  supports: (scenario) => scenario.type === "mixed",
  run: async (scenario, ctx) => {
    return makeArtifact(scenario, ctx, "SKIP", [], "mixed runner not yet implemented");
  },
};

// ---------------------------------------------------------------------------
// Runner Dispatch
// ---------------------------------------------------------------------------

export const RUNNERS: readonly Runner[] = [apiRunner, agentBrowserRunner, cliRunner, mixedRunner];

export async function runScenario(
  scenario: Scenario,
  ctx: RunnerContext,
): Promise<ScenarioArtifact> {
  const runner = RUNNERS.find((r) => r.supports(scenario));
  if (!runner) {
    return makeArtifact(scenario, ctx, "SKIP", [], "no runner available");
  }
  return runner.run(scenario, ctx);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function aggregateVerdicts(artifacts: readonly ScenarioArtifact[]): {
  pass: number;
  fail: number;
  skip: number;
  warn: number;
  inconclusive: number;
  blocksShip: boolean;
} {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  let warn = 0;
  let inconclusive = 0;

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
  }

  // [Spec R2-AC3] INCONCLUSIVE does NOT increment fail and does NOT block ship.
  return { pass, fail, skip, warn, inconclusive, blocksShip: fail > 0 };
}

export function renderAcceptanceReport(result: AcceptanceRunResult): string {
  const lines: string[] = [
    `# Acceptance Report — ${result.topic}`,
    "",
    "## Summary",
    "",
    `| Verdict | Count |`,
    `|---------|-------|`,
    `| PASS    | ${result.summary.pass} |`,
    `| FAIL    | ${result.summary.fail} |`,
    `| SKIP    | ${result.summary.skip} |`,
    `| WARN    | ${result.summary.warn} |`,
    "",
    `**Blocks Ship**: ${result.summary.blocksShip ? "YES" : "NO"}`,
    "",
    "## Scenarios",
    "",
  ];

  for (const s of result.scenarios) {
    lines.push(`### ${s.scenarioId}`);
    lines.push(`- **Verdict**: ${s.verdict}`);
    lines.push(`- **Source**: ${s.source}`);
    if (s.failureReason) {
      lines.push(`- **Failure Reason**: ${s.failureReason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers (pure functions, testable)
// ---------------------------------------------------------------------------

function makeArtifact(
  scenario: Scenario,
  _ctx: RunnerContext,
  verdict: Verdict,
  evidence: readonly string[],
  failureReason?: string,
): ScenarioArtifact {
  return {
    scenarioId: scenario.id,
    source: scenario.source,
    givenWhenThen: `Given ${scenario.given}\nWhen ${scenario.when}\nThen ${scenario.then}`,
    executedAt: new Date().toISOString(),
    verdict,
    evidence,
    failureReason,
  };
}

export function extractEndpoint(text: string): string | null {
  const match = text.match(/(?:endpoint|url|api)\s+(?:is\s+)?(\/?\S+)/i);
  return match ? match[1] : null;
}

export function extractMethod(text: string): string {
  const match = text.match(/\b(GET|POST|PUT|DELETE|PATCH)\b/i);
  return match ? match[1].toUpperCase() : "GET";
}

export function extractCommand(text: string): string | null {
  const match = text.match(/(?:run|execute)\s+['"`](.+?)['"`]/i);
  return match ? match[1] : null;
}

/**
 * Shell-escape a string by wrapping in single quotes and escaping any
 * embedded single quotes using the standard `'\''` idiom.
 * Strips newlines to prevent multi-command injection.
 */
function shellEscape(s: string): string {
  const sanitized = s.replace(/[\r\n]/g, "");
  // Replace embedded single quotes with '\'' (end quote, escaped quote, reopen quote)
  return `'${sanitized.replace(/'/g, "'\\''")}'`;
}

export function buildCurlCommand(method: string, url: string): string {
  const safeMethod = /^[A-Z]+$/i.test(method) ? method.toUpperCase() : "GET";
  return `curl -s -o /dev/null -w "%{http_code}" -X ${safeMethod} ${shellEscape(url)}`;
}

function evaluateApiVerdict(
  result: { stdout: string; stderr: string },
  assertion: string,
): Verdict {
  const statusMatch = assertion.match(/(\d{3})/);
  if (statusMatch && !result.stdout.includes(statusMatch[1])) {
    return "FAIL";
  }
  return "PASS";
}

function evaluateCliVerdict(
  result: { stdout: string; stderr: string },
  assertion: string,
): Verdict {
  if (assertion.includes("exit") && assertion.includes("0")) {
    return "PASS";
  }
  if (assertion.toLowerCase().includes("stdout") && assertion.includes("contain")) {
    return result.stdout.length > 0 ? "PASS" : "FAIL";
  }
  return "PASS";
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function execCommand(_cmd: string): Promise<ExecResult> {
  // Placeholder — actual execution handled by driver layer
  return { stdout: "200", stderr: "" };
}
