import { execFile } from "node:child_process";
import { runCli } from "./cli.mjs";

/**
 * workspace-reorder.mjs — raise the active Forge workspace to the front.
 *
 * Grounded on the real `cmux reorder-workspaces` CLI (cmux 0.64.10+):
 *   cmux reorder-workspaces --order <ref>,<ref>,... [--window <id>] [--dry-run]
 *
 * Two correctness notes captured from the live `--help` (not the changelog gloss):
 *  - reorder-workspaces is a **CLI subcommand**, not an RPC method, so it is NOT
 *    routed through `cmux rpc`. It must be argv'd directly.
 *  - "--order" reorders *within pinned/unpinned groups* ("raise to front of its
 *    group") — it is NOT a true sticky pin. We model it as "raise", not "pin".
 *
 * The support probe uses `--help` (offline-safe: needs no socket), unlike
 * `cmux capabilities --json` which requires a running cmux and does not list
 * CLI subcommands anyway.
 */

const PROBE_TIMEOUT_MS = 2000;
const DISPATCH_TIMEOUT_MS = 2000;
const REF_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

/** null = unknown, true/false = probed. */
let supportedCache = null;

/**
 * Build the argv for a `cmux reorder-workspaces` call.
 * Pure & validated — safe to unit-test without cmux.
 *
 * Does NOT inject `--window`: runCli() owns global --window injection from
 * CMUX_WINDOW_ID / opts.windowId (same envelope as every other dispatch site).
 *
 * @param {{ orderRefs: string[] | string, dryRun?: boolean }} opts
 * @returns {string[]}
 */
export function buildReorderArgs({ orderRefs, dryRun = false }) {
  const refs = Array.isArray(orderRefs) ? orderRefs : [orderRefs];
  if (refs.length === 0) {
    throw new Error("buildReorderArgs: orderRefs must not be empty");
  }
  for (const ref of refs) {
    if (typeof ref !== "string" || !REF_PATTERN.test(ref)) {
      throw new Error(`buildReorderArgs: invalid workspace ref: ${String(ref)}`);
    }
  }
  const args = ["reorder-workspaces", "--order", refs.join(",")];
  if (dryRun) args.push("--dry-run");
  return args;
}

/**
 * Probe whether `cmux reorder-workspaces` exists on this cmux build.
 * Uses `--help` (offline-safe). Cached for the process lifetime.
 * @param {string} cmuxBin
 * @returns {Promise<boolean>}
 */
export function probeReorderSupported(cmuxBin = "cmux") {
  if (supportedCache !== null) return Promise.resolve(supportedCache);
  return new Promise((resolve) => {
    execFile(
      cmuxBin,
      ["reorder-workspaces", "--help"],
      { timeout: PROBE_TIMEOUT_MS },
      (err) => {
        supportedCache = !err;
        resolve(supportedCache);
      },
    );
  });
}

/**
 * Raise the active workspace to the front of its group. Zero-Impact:
 * no-ops when there is no active ref, when cmux lacks the command, or when the
 * dispatch fails. Never throws.
 *
 * @param {{ activeRef: string, windowId?: string, dryRun?: boolean, runCli?: Function }} opts
 * @returns {Promise<{ applied: boolean, reason?: string, ref?: string }>}
 */
export async function raiseActiveWorkspace({
  activeRef,
  windowId,
  dryRun = false,
  runCli: run = runCli,
}) {
  if (!activeRef) return { applied: false, reason: "no_active_ref" };

  if (!(await probeReorderSupported())) {
    return { applied: false, reason: "unsupported" };
  }

  try {
    const args = buildReorderArgs({ orderRefs: [activeRef], dryRun });
    const result = await run(args, { timeoutMs: DISPATCH_TIMEOUT_MS, windowId });
    if (result === null || result.exitCode !== 0) {
      return { applied: false, reason: "dispatch_failed" };
    }
    return { applied: true, ref: activeRef };
  } catch {
    return { applied: false, reason: "dispatch_failed" };
  }
}

export function __resetReorderForTest() {
  supportedCache = null;
}

export function __setReorderSupportedForTest(value) {
  supportedCache = value;
}
