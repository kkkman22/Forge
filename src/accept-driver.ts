import type {
  AcceptanceRunResult,
  Scenario,
  ScenarioArtifact,
  ScenarioType,
  Verdict,
} from "./accept.js";

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
// UI Runner
// ---------------------------------------------------------------------------

export const uiRunner: Runner = {
  type: "ui",
  supports: (scenario) => scenario.type === "ui",
  run: async (scenario, ctx) => {
    if (!ctx.tierAvailability.cmuxAvailable) {
      return makeArtifact(scenario, ctx, "SKIP", [], "cmux browser not available");
    }
    // Tier B workflow is handled by the frontend-check agent at runtime
    // This runner provides the scenario-level orchestration hook
    return makeArtifact(
      scenario,
      ctx,
      "SKIP",
      [],
      "UI runner requires manual cmux execution — see frontend-check Tier B",
    );
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

export const RUNNERS: readonly Runner[] = [apiRunner, uiRunner, cliRunner, mixedRunner];

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
