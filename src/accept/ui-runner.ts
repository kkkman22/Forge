/**
 * UI runner — agent-browser (snapshot+refs) agentic driver — extracted from
 * accept-driver.ts (P3-1 god-file split).
 *
 * [Spec R1-AC1..AC4, R3-AC6] Replaces the legacy always-SKIP uiRunner.
 */

import { resolvePlaceholder } from "../accept-credentials.js";
import { isUrlAllowed, redactSnapshot } from "../accept-security.js";
import {
  AgentBrowserCliClient,
  type AgentBrowserClient,
  type Snapshot,
} from "../agent-browser-client.js";
import { evaluateUiVerdict } from "../evaluate-ui-verdict.js";
import type { Runner, RunnerContext } from "./artifact.js";
import { makeArtifact } from "./artifact.js";

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
