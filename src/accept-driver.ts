import type {
  AcceptanceRunResult,
  Scenario,
  ScenarioArtifact,
  ScenarioType,
  Verdict,
} from "./accept.js";
import { resolvePlaceholder } from "./accept-credentials.js";
import { isUrlAllowed, redactSnapshot } from "./accept-security.js";
import {
  AgentBrowserCliClient,
  type AgentBrowserClient,
  type Snapshot,
} from "./agent-browser-client.js";
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
      // Req4: when the THEN clause asserts on data.<path>, keep the body so
      // evaluateApiVerdictWithBody can check field values (not just status).
      const wantsBody = /data\.\w/i.test(scenario.then);
      const d = buildCurlArgs(method, url, { assertBody: wantsBody });
      const result = await execDescriptor(d);

      if (wantsBody) {
        const apiResult = evaluateApiVerdictWithBody(result, scenario.then);
        // Req4 AC6: never write the full body to the artifact — only the
        // matched path:value summary (may contain sensitive data otherwise).
        const evidence = apiResult.bodySummary ? [apiResult.bodySummary] : [];
        return makeArtifact(scenario, ctx, apiResult.verdict, evidence, apiResult.failureReason);
      }
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
    // Only verify when using the real CLI client (Fake in tests has no binary).
    if (client instanceof AgentBrowserCliClient) {
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
// Delegate Runners (ADR-0006 Req3 / Change 3)
//
// Thin shells that delegate to the PROJECT's own test command via forge_exec.
// They never start a browser or hit a real API — they route the AC to the
// project's existing runner and let aggregateVerdicts do the rest. When no
// suite is configured, they return INCONCLUSIVE (honest, non-blocking) with a
// recipe pointer, rather than masking the gap with a silent SKIP.
// ---------------------------------------------------------------------------

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
  const explicit = cfg.testCommands?.[layer];
  if (explicit) {
    return evidencePath ? `${explicit} ${evidencePath}` : explicit;
  }
  const pkg = cfg.packageManager ?? "npm";
  const cmd = `${pkg} run test:${layer}`;
  return evidencePath ? `${cmd} ${evidencePath}` : cmd;
}

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
    const artifactStat = statSync(input.artifactPath);
    if (input.swaggerSourcePath) {
      try {
        const swaggerStat = statSync(input.swaggerSourcePath);
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

function readContractSource(scenario: Scenario): ContractSource {
  const m = scenario.rawText.match(/Contract-Source:\s*(\w+)/i);
  return (m?.[1] as ContractSource) ?? "manual";
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

// ---------------------------------------------------------------------------
// Runner Dispatch
// ---------------------------------------------------------------------------

export const RUNNERS: readonly Runner[] = [
  unitRunner,
  componentRunner,
  contractRunner,
  apiRunner,
  agentBrowserRunner,
  cliRunner,
];

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

// ---------------------------------------------------------------------------
// Pyramid layer classification (ADR-0006 Req5 / Req7) — pure functions
// ---------------------------------------------------------------------------

/** Pyramid shape classification (Req5 AC2). Advisory; never blocks ship. */
export type PyramidShape = "healthy" | "e2e-heavy" | "empty-middle" | "no-unit" | "empty";

/** Per-layer health counts (Req5 AC1). */
export interface LayerHealth {
  pass: number;
  fail: number;
  inconclusive: number;
}

export interface LayerHealthBreakdown {
  unit: LayerHealth;
  component: LayerHealth;
  contract: LayerHealth;
  e2e: LayerHealth;
}

/**
 * Map a ScenarioType to its pyramid layer. ADR-0006: api/ui/cli/mixed all run
 * as real end-to-end (curl / browser / shell), so they fold into the e2e layer.
 * unit/component/contract are the three delegate (cheap) layers.
 */
export function layerOf(type: ScenarioType | undefined): "unit" | "component" | "contract" | "e2e" {
  switch (type) {
    case "unit":
      return "unit";
    case "component":
      return "component";
    case "contract":
      return "contract";
    // api/ui/cli/mixed/unknown/undefined all fold to the e2e execution layer.
    default:
      return "e2e";
  }
}

function emptyLayerHealth(): LayerHealth {
  return { pass: 0, fail: 0, inconclusive: 0 };
}

/** Classify the pyramid shape from per-layer scenario counts (pure). */
export function classifyPyramid(counts: {
  unit: number;
  component: number;
  contract: number;
  e2e: number;
}): PyramidShape {
  const total = counts.unit + counts.component + counts.contract + counts.e2e;
  if (total === 0) return "empty";
  const middle = counts.component + counts.contract;
  const hasUnit = counts.unit > 0;
  const hasMiddle = middle > 0;
  const hasE2e = counts.e2e > 0;

  // Precedence: e2e-only → e2e-heavy; e2e+middle without unit → no-unit;
  // unit+e2e without middle → empty-middle; otherwise healthy.
  if (hasE2e && !hasUnit && !hasMiddle) return "e2e-heavy";
  if (hasE2e && hasMiddle && !hasUnit) return "no-unit";
  if (hasUnit && hasE2e && !hasMiddle) return "empty-middle";
  return "healthy";
}

export interface PyramidConfig {
  /** Max ratio of non-`@critical` e2e scenarios before the gate fires. */
  e2eRatioThreshold: number;
  /** When false, the ratio gate degrades to advisory (never blocks). */
  strictPyramid: boolean;
}

/**
 * Shared e2e-heavy detector (Req5 signal + Req7 gate reuse the same logic).
 * Pure; deterministic; no IO. Counts api/ui/cli/mixed as the e2e layer and
 * excludes the `@critical`-tagged e2e from the ratio (Req7 AC4).
 */
export function isE2eHeavy(
  scenarios: readonly { type: ScenarioType; tags: readonly string[] }[],
  config: PyramidConfig,
): boolean {
  const total = scenarios.length;
  if (total < 3) return false; // small-spec exemption (Req7 AC6)
  if (!config.strictPyramid || config.e2eRatioThreshold <= 0) return false;
  const e2eNonCritical = scenarios.filter(
    (s) => layerOf(s.type) === "e2e" && !s.tags.includes("@critical"),
  ).length;
  const middle = scenarios.filter((s) => ["unit", "component", "contract"].includes(s.type)).length;
  return e2eNonCritical / total > config.e2eRatioThreshold && middle === 0;
}

export function aggregateVerdicts(artifacts: readonly ScenarioArtifact[]): {
  pass: number;
  fail: number;
  skip: number;
  warn: number;
  inconclusive: number;
  blocksShip: boolean;
  layerHealth: LayerHealthBreakdown;
  pyramidShape: PyramidShape;
} {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  let warn = 0;
  let inconclusive = 0;

  const layerHealth: LayerHealthBreakdown = {
    unit: emptyLayerHealth(),
    component: emptyLayerHealth(),
    contract: emptyLayerHealth(),
    e2e: emptyLayerHealth(),
  };

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

    // Artifacts without a type (legacy) are not counted in any layer — they
    // still contribute to the flat counts above but have no pyramid home.
    if (a.type === undefined) continue;
    const layer = layerOf(a.type);
    const h = layerHealth[layer];
    if (a.verdict === "PASS") h.pass++;
    else if (a.verdict === "FAIL") h.fail++;
    else if (a.verdict === "INCONCLUSIVE") h.inconclusive++;
  }

  const pyramidShape = classifyPyramid({
    unit: layerHealth.unit.pass + layerHealth.unit.fail + layerHealth.unit.inconclusive,
    component:
      layerHealth.component.pass + layerHealth.component.fail + layerHealth.component.inconclusive,
    contract:
      layerHealth.contract.pass + layerHealth.contract.fail + layerHealth.contract.inconclusive,
    e2e: layerHealth.e2e.pass + layerHealth.e2e.fail + layerHealth.e2e.inconclusive,
  });

  // [Spec R2-AC3] INCONCLUSIVE does NOT increment fail and does NOT block ship.
  // pyramidShape is advisory (Req5 AC5) and never affects blocksShip.
  return { pass, fail, skip, warn, inconclusive, blocksShip: fail > 0, layerHealth, pyramidShape };
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
  ];

  // Req5 AC4: surface per-layer health + pyramid shape (advisory signal).
  if (result.summary.pyramidShape) {
    lines.push(`**Pyramid Shape**: ${result.summary.pyramidShape}`);
    const lh = result.summary.layerHealth;
    if (lh) {
      lines.push("");
      lines.push("| Layer | PASS | FAIL | INCONCLUSIVE |");
      lines.push("|-------|------|------|--------------|");
      for (const layer of ["unit", "component", "contract", "e2e"] as const) {
        const h = lh[layer];
        lines.push(`| ${layer} | ${h.pass} | ${h.fail} | ${h.inconclusive} |`);
      }
    }
    lines.push("");
  }

  lines.push("## Scenarios", "");

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
    type: scenario.type,
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

// ---------------------------------------------------------------------------
// API body assertions (ADR-0006 Req4) — pure helpers
// ---------------------------------------------------------------------------

/** Split curl output (when body is retained) into body + trailing status. */
export function splitBodyAndStatus(stdout: string): { body: string; status: string | null } {
  // curl -w "%{http_code}" appends the 3-digit code at the very end.
  const m = stdout.match(/^(.*?)(\d{3})$/s);
  if (!m) return { body: stdout, status: null };
  const status = m[2];
  const body = m[1];
  // When only the status is present (body discarded), body is empty.
  if (body === "") return { body: "", status };
  return { body, status };
}

/** Match a dotted JSONPath (e.g. "data.role", "data.items.0.id") against parsed JSON. */
export function matchJsonPath(
  obj: unknown,
  path: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const segments = path.split(".");
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined) {
      return { ok: false, reason: `path "${path}" unreachable at "${seg}"` };
    }
    if (typeof cur !== "object") {
      return { ok: false, reason: `path "${path}" hit non-object at "${seg}"` };
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (cur === undefined) {
    return { ok: false, reason: `path "${path}" not found` };
  }
  return { ok: true, value: cur };
}

export interface BodyMatch {
  path: string;
  value: unknown;
}

/**
 * Redact a parsed body to only the matched path:value pairs (Req4 AC6).
 * The full body is never written to the artifact — only the assertion-relevant
 * fields, so sensitive fields (tokens, passwords) are not leaked.
 */
export function redactBody(_body: unknown, matches: readonly BodyMatch[]): string {
  return matches.map((m) => `${m.path}:${JSON.stringify(m.value)}`).join(", ");
}

export interface ApiVerdictResult {
  verdict: Verdict;
  failureReason?: string;
  /** Req4 AC6: only matched path:value pairs, never the full body. */
  bodySummary?: string;
}

/** Parse a `data.<path> shall be <value>` assertion from a THEN clause. */
function parseBodyAssertion(assertion: string): { path: string; expected: string } | null {
  // Matches: data.role shall be "admin"  /  data.role shall be 'admin'
  //         data.status shall be active  /  data.count shall be 3
  const m = assertion.match(/data\.([\w.]+)\s+shall\s+be\s+["']?([^"'\s,.]+)["']?/i);
  if (!m) return null;
  return { path: `data.${m[1]}`, expected: m[2] };
}

/**
 * Evaluate an API verdict supporting both status-code and response-body
 * assertions (Req4 AC2-AC5). Pure; throws never.
 */
export function evaluateApiVerdictWithBody(
  result: { stdout: string; stderr: string },
  assertion: string,
): ApiVerdictResult {
  const bodyAssertion = parseBodyAssertion(assertion);
  const statusMatch = assertion.match(/(\d{3})/);

  // AC4: status-only path (no body assertion) → back-compat.
  if (!bodyAssertion) {
    if (statusMatch && !result.stdout.includes(statusMatch[1])) {
      return { verdict: "FAIL", failureReason: `status ${statusMatch[1]} not in stdout` };
    }
    return { verdict: "PASS" };
  }

  // Body assertion path: split body from status, parse JSON, match path.
  const { body, status } = splitBodyAndStatus(result.stdout);

  // AC3: if a status is also asserted, it must match too.
  if (statusMatch && status !== statusMatch[1]) {
    return {
      verdict: "FAIL",
      failureReason: `status ${statusMatch[1]} expected, got ${status ?? "none"}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = body.length > 0 ? JSON.parse(body) : null;
  } catch {
    // AC5: non-JSON body → FAIL + reason, no throw.
    return { verdict: "FAIL", failureReason: "response body is not valid JSON" };
  }

  const matched = matchJsonPath(parsed, bodyAssertion.path);
  if (!matched.ok) {
    return { verdict: "FAIL", failureReason: matched.reason };
  }

  // Normalize both sides to strings for comparison (expected is already a string).
  const actual = String(matched.value);
  if (actual !== bodyAssertion.expected) {
    return {
      verdict: "FAIL",
      failureReason: `${bodyAssertion.path}: expected "${bodyAssertion.expected}", got "${actual}"`,
    };
  }

  // AC6: record only the matched path:value, never the full body.
  return {
    verdict: "PASS",
    bodySummary: redactBody(parsed, [{ path: bodyAssertion.path, value: matched.value }]),
  };
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

/** @internal */
export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Build a curl descriptor for the API runner — pure function, no shell string.
 * Instinct: descriptor + execFile (reject strategy). [T3.2]
 *
 * opts.assertBody (Req4 AC1): when true, curl keeps the response body so
 * evaluateApiVerdictWithBody can assert on data.<path> fields. Default false
 * discards the body (back-compat with status-only assertions).
 */
export function buildCurlArgs(
  method: string,
  url: string,
  opts?: { assertBody?: boolean },
): {
  executable: string;
  args: string[];
} {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`buildCurlArgs: invalid url: ${url}`);
  }
  const safeMethod = /^[A-Z]+$/i.test(method) ? method.toUpperCase() : "GET";
  if (opts?.assertBody) {
    // Keep the body, still append http_code via -w for status assertion.
    return {
      executable: "curl",
      args: ["-s", "-w", "%{http_code}", "-X", safeMethod, url],
    };
  }
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
