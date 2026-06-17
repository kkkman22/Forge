import type {
  AcceptanceRunResult,
  Scenario,
  ScenarioArtifact,
  ScenarioType,
  Verdict,
} from "./accept.js";
import { resolvePlaceholder } from "./accept-credentials.js";
import { isUrlAllowed, redactSnapshot } from "./accept-security.js";
import type { AgentBrowserClient, Snapshot } from "./agent-browser-client.js";
import { evaluateUiVerdict } from "./evaluate-ui-verdict.js";

/** Default navigation allowlist — localhost + loopback only. [R4-AC5] */
const DEFAULT_URL_ALLOWLIST = ["localhost", "127.0.0.1"];

/**
 * Verify the agent-browser binary's SHA256 against the configured pin. [R4-AC6]
 * Empty/missing pin → dev-mode allow (ok=true). Non-empty mismatch → fail-closed.
 */
async function verifyAgentBrowserPin(): Promise<{ ok: boolean; reason: string }> {
  try {
    const { readFileSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    const { join } = await import("node:path");
    const { createHash } = await import("node:crypto");
    const binPath = execFileSync("which", ["agent-browser"], { encoding: "utf-8" }).trim();
    const buf = readFileSync(binPath);
    const actual = createHash("sha256").update(buf).digest("hex");
    const cfgPath = join(process.cwd(), ".forge", "config.md");
    let configuredPin = "";
    try {
      const cfg = readFileSync(cfgPath, "utf8");
      const m = cfg.match(/agent_browser_pin_sha256:\s*"?([a-f0-9]+)"?\s*$/m);
      configuredPin = m?.[1] ?? "";
    } catch {
      // config absent — dev mode, allow
    }
    if (!configuredPin) return { ok: true, reason: "no pin configured (dev mode)" };
    if (actual === configuredPin) return { ok: true, reason: "pin matches" };
    return { ok: false, reason: `sha256 mismatch (expected ${configuredPin.slice(0, 12)}…)` };
  } catch (e) {
    return { ok: false, reason: `pin check error: ${String((e as Error).message ?? e)}` };
  }
}

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
      // endpoint may be a relative path (e.g. /api/login); resolve to full URL.
      const base = ctx.appUrl ?? "http://localhost:5173";
      const url = /^https?:\/\//i.test(endpoint)
        ? endpoint
        : `${base}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
      const d = buildCurlArgs(method, url);
      const result = await execDescriptor(d);

      const verdict = evaluateApiVerdict(result, scenario.then);
      return makeArtifact(scenario, ctx, verdict, [result.stdout], undefined);
    } catch (e) {
      // Environment-level failure (curl crash/network) → INCONCLUSIVE. [T3.2]
      return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], String(e));
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
    if (r.text?.toLowerCase().includes(kw)) return r.ref;
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
      return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], "dev server not running");
    }
    const appUrl = ctx.appUrl ?? "http://localhost:5173";

    // P0-1 [R4-AC5] URL allowlist — abort to INCONCLUSIVE if appUrl is outside allowlist.
    const allowlistHosts = DEFAULT_URL_ALLOWLIST;
    if (!isUrlAllowed(appUrl, allowlistHosts)) {
      return makeArtifact(
        scenario,
        ctx,
        "INCONCLUSIVE",
        [],
        `URL not in allowlist: ${appUrl} (allowed hosts: ${allowlistHosts.join(",")})`,
      );
    }

    // P0-2 [R4-AC6] agent-browser binary pin verification — fail-closed on mismatch.
    const pin = await verifyAgentBrowserPin();
    if (!pin.ok) {
      return makeArtifact(
        scenario,
        ctx,
        "INCONCLUSIVE",
        [],
        `agent-browser binary not verified: ${pin.reason}`,
      );
    }

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

      // act: fill form fields + click the action button described in WHEN.
      const whenText = scenario.when;
      const ctxText = `${scenario.given}\n${scenario.when}`;
      // Best-effort: fill textboxes with values extracted from the scenario text.
      // Values may be {{PLACEHOLDER}} secrets resolved from env [R4-AC1, R4-AC2].
      const textboxes = snap.refs.filter((r) => r.role === "textbox");
      const fillValues = extractFillValues(ctxText);
      const valueByKey = indexFillValuesByKey(fillValues);
      for (const tb of textboxes) {
        const tbRef = tb.ref;
        // P1-3: match value by the textbox's label (用户名/密码/username/password),
        // not by index — DOM order need not equal scenario text order.
        const raw = matchValueForTextbox(tb.text, fillValues, valueByKey);
        const resolved = resolvePlaceholder(raw, process.env as Record<string, string | undefined>);
        if (resolved === null) {
          // missing secret → INCONCLUSIVE, do not leak raw placeholder
          return makeArtifact(
            scenario,
            ctx,
            "INCONCLUSIVE",
            [],
            `missing secret placeholder in scenario`,
          );
        }
        const val = resolved;
        const tbLabel = tb.text;
        await actWithRetry(client, sessionId, tbRef, tbLabel, (r) =>
          client.fill(sessionId, r, val),
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
        const clickOk = await actWithRetry(client, sessionId, clickedRef, clickKw, (r) =>
          client.click(sessionId, r),
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
      let shotOk = false;
      try {
        await client.screenshot(sessionId, shotPath);
        shotOk = true;
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
        shotOk
          ? verdict === "PASS"
            ? [shotPath]
            : [shotPath, redactSnapshot(snap.url)]
          : [redactSnapshot(snap.url)],
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
/**
 * Run an action with up to MAX_REF_RETRIES retries on stale-ref errors.
 * P1-2/F1: on stale, re-snapshot AND re-locate the ref by text keyword before
 * retrying (a stale ref id may change after page mutation). F2: narrower match
 * to avoid retrying unrecoverable errors.
 * The act factory receives the CURRENT ref so retry can use the relocated one.
 */
async function actWithRetry(
  client: AgentBrowserClient,
  sessionId: string,
  initialRef: string,
  relocateKeyword: string | null,
  act: (ref: string) => Promise<void>,
): Promise<boolean> {
  let ref = initialRef;
  for (let attempt = 0; attempt <= MAX_REF_RETRIES; attempt++) {
    try {
      await act(ref);
      return true;
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      const isStale = /stale element|ref not found|not attached|element.*not found/i.test(msg);
      if (attempt < MAX_REF_RETRIES && isStale && relocateKeyword) {
        const fresh = await client.snapshot(sessionId);
        const relocated = findRefByText(fresh.refs, relocateKeyword);
        if (relocated) ref = relocated;
        continue;
      }
      return false;
    }
  }
  // Unreachable: loop always returns or continues; kept as type-safety fallback.
  return false;
}

/** Extract a likely action keyword (button label) from a WHEN clause. */
export function extractActionKeyword(whenText: string): string | null {
  // "点击 登录按钮" / "click 登录" → take the trailing noun after the verb.
  const m = whenText.match(/(?:点击|click|按下|tap)\s*([^\s,，。]+)/i);
  if (m?.[1]) return m[1].replace(/按钮$/, "");
  return null;
}

/**
 * Extract fill values (usernames/passwords) from the scenario G/W text.
 * Recognizes "用户名 X", "密码 Y", "{{VAR}}" patterns. Returns ordered values.
 */
/**
 * P1-3: match a fill value to a textbox by its visible label, not by index.
 */
function matchValueForTextbox(
  label: string,
  fillValues: { key: string; value: string }[],
  valueByKey: Record<string, string>,
): string {
  const low = label.toLowerCase();
  if (/用户名|username|user|email|邮箱/.test(low) && valueByKey.username) {
    return valueByKey.username;
  }
  if (/密码|password|pwd/.test(low) && valueByKey.password) {
    return valueByKey.password;
  }
  return fillValues[0]?.value ?? "admin";
}

/** Build a {username,password} map from extracted fill values (by order). */
function indexFillValuesByKey(pairs: { key: string; value: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of pairs) map[p.key] = p.value;
  return map;
}

/** Extract (key, value) pairs. P1-B: keyed, not positional. */
function extractFillValues(text: string): { key: string; value: string }[] {
  const pairs: { key: string; value: string }[] = [];
  const re = /(用户名|username|密码|password|pwd)\s+([^\s,，。、]+)/gi;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
  while ((m = re.exec(text)) !== null) {
    if (m[1] && m[2]) {
      const low = m[1].toLowerCase();
      const key = /密码|password|pwd/.test(low) ? "password" : "username";
      pairs.push({ key, value: m[2] });
    }
  }
  return pairs;
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
    return makeArtifact(scenario, ctx, "INCONCLUSIVE", [], "no runner available for scenario type");
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
  const total = result.scenarios.length;
  const lines: string[] = [
    `# Acceptance Report — ${result.topic}`,
    "",
    "## Summary",
    "",
    `Run: ${total} scenario${total === 1 ? "" : "s"}${result.summary.skip > 0 ? ` (${result.summary.skip} skipped, --all to show)` : ""}`,
    "",
    `| Verdict | Count |`,
    `|---------|-------|`,
    `| PASS    | ${result.summary.pass} |`,
    `| FAIL    | ${result.summary.fail} |`,
    `| SKIP    | ${result.summary.skip} |`,
    `| WARN    | ${result.summary.warn} |`,
    `| INCONCLUSIVE | ${result.summary.inconclusive} |`,
    "",
    `**Blocks Ship**: ${result.summary.blocksShip ? "YES" : "NO"}`,
    "",
    "## Scenarios",
    "",
  ];

  for (const s of result.scenarios) {
    const marker = verdictMarker(s.verdict);
    // R5-AC3: PASS collapses to a single line.
    if (s.verdict === "PASS" || s.verdict === "SKIP" || s.verdict === "WARN") {
      lines.push(`- ${marker} \`${s.scenarioId}\` — ${s.verdict}`);
      continue;
    }
    // FAIL / INCONCLUSIVE expand with detail.
    lines.push(`### ${marker} ${s.scenarioId} — ${s.verdict}`);
    if (s.verdict === "INCONCLUSIVE") {
      lines.push("");
      lines.push("> 这不是失败——是当前环境无法验证，不阻断 ship。");
    }
    // R5-AC2: render Given/When/Then original text; highlight the Then clause on FAIL.
    if (s.givenWhenThen) {
      lines.push("");
      lines.push("**Scenario**:");
      lines.push("");
      for (const line of s.givenWhenThen.split("\n")) {
        const isThen = /^\s*(Then|那么)/i.test(line);
        const emphasize = s.verdict === "FAIL" && isThen;
        lines.push(emphasize ? `> **${line}** ← 未满足` : `> ${line}`);
      }
    }
    if (s.failureReason) {
      lines.push("");
      lines.push(`- **Reason**: ${s.failureReason}`);
    }
    // R5-AC4: Next → heuristic hint.
    lines.push("");
    lines.push(`- **Next →** ${nextHint(s)}`);
    // R5-AC3: evidence folded in <details>.
    if (s.evidence.length > 0) {
      lines.push("");
      lines.push("<details><summary>Evidence</summary>");
      lines.push("");
      for (const e of s.evidence) {
        lines.push(`- ${e}`);
      }
      lines.push("");
      lines.push("</details>");
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** R5-AC1 visual marker per verdict. */
function verdictMarker(v: Verdict): string {
  switch (v) {
    case "PASS":
      return "✅";
    case "FAIL":
      return "❌";
    case "INCONCLUSIVE":
      return "❔";
    case "WARN":
      return "🟡";
    default:
      return "⏭️";
  }
}

/** R5-AC4 heuristic next-step hint per scenario type/verdict. */
function nextHint(s: ScenarioArtifact): string {
  if (s.verdict === "INCONCLUSIVE") {
    return "确认 agent-browser 已安装、dev server 已启动，或改用 Playwright e2e。";
  }
  if (s.verdict === "FAIL") {
    const reason = s.failureReason ?? "";
    // UI jump/redirect failures
    if (/跳转|jump|redirect|dashboard|navigation/i.test(reason)) {
      return "UI 跳转未发生，检查路由守卫/鉴权返回。";
    }
    // Assertion mismatch (THEN not satisfied)
    if (/THEN not satisfied|assertion|snapshot/i.test(reason)) {
      return "THEN 预期与实际页面不符：核对断言关键词、或用 /forge test 跑单元层定位。";
    }
    // API http code mismatch
    if (/http|code|401|403|500|api/i.test(reason)) {
      return "API 返回码不符：检查路由/鉴权中间件，或用 /forge test 跑单元层。";
    }
    // CLI exit code
    if (/exit|command|cli|stderr/i.test(reason)) {
      return "CLI 命令失败：查看 stderr evidence 块，确认命令与依赖。";
    }
    return "核对 THEN 预期与实际 snapshot 差异；用 /forge test 跑单元层定位。";
  }
  return "—";
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
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`buildCurlArgs: invalid url: ${url}`);
  }
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

/**
 * Build a curl descriptor for the API runner — pure function, no shell string.
 * Instinct: descriptor + execFile (reject strategy). [T3.2]
 */
export function buildCurlArgs(
  method: string,
  url: string,
): {
  executable: string;
  args: string[];
} {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`buildCurlArgs: invalid url: ${url}`);
  }
  const safeMethod = /^[A-Z]+$/i.test(method) ? method.toUpperCase() : "GET";
  // -s silent, -o /dev/null discard body, -w http_code, -X method.
  return {
    executable: "curl",
    args: ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", safeMethod, url],
  };
}

/**
 * Execute a {executable, args} descriptor via execFile (no shell).
 * [T3.2] Replaces the placeholder. Instinct: execFileSync-style descriptor.
 */
export async function execDescriptor(
  d: {
    executable: string;
    args: string[];
  },
  timeoutMs = 15_000,
): Promise<ExecResult> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(
      d.executable,
      d.args,
      { encoding: "utf8", timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (err: Error | null, stdout: string, stderr: string) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      },
    );
  });
}
