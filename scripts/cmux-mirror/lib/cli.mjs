import { execFile } from "node:child_process";
import { markUnavailable } from "./availability.mjs";

const DEFAULT_TIMEOUT_MS = 5000;
const SAFE_WINDOW_ID = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * Build cmux CLI args for a JSON-RPC method call (R1.4).
 * cmux 0.64.x routes generic RPC through `cmux rpc <method> <json-params>`;
 * a bare `cmux <method>` is "Unknown command". This envelope is shared by both
 * dispatch sites (sync-once one-shot + mirror daemon).
 * @param {{ method: string, params?: unknown }} cmd
 * @returns {string[]}
 */
export function buildRpcArgs(cmd) {
  const args = ["rpc", cmd.method];
  if (cmd.params !== undefined) {
    args.push(JSON.stringify(cmd.params));
  }
  return args;
}

function resolveWindowId(opts) {
  const candidate = opts.windowId ?? process.env.CMUX_WINDOW_ID ?? "";
  if (!candidate) return null;
  if (candidate.includes("..")) return null;
  if (!SAFE_WINDOW_ID.test(candidate)) return null;
  return candidate;
}

/**
 * Run a cmux CLI command (R1.4, R11.2).
 * Returns null on EPIPE/ECONNREFUSED/ENOENT (triggers markUnavailable).
 */
export function runCli(args, { timeoutMs = DEFAULT_TIMEOUT_MS, windowId } = {}) {
  const winId = resolveWindowId({ windowId });
  const finalArgs = winId ? ["--window", winId, ...args] : args;
  return new Promise((resolve) => {
    execFile(
      "cmux",
      finalArgs,
      { timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (err.message ?? "").toLowerCase();
          if (
            err.code === "ENOENT" ||
            msg.includes("epipe") ||
            msg.includes("econnrefused") ||
            msg.includes("broken pipe") ||
            msg.includes("refused") ||
            (typeof stderr === "string" &&
              (stderr.includes("refused") || stderr.includes("broken pipe")))
          ) {
            markUnavailable(err.code ?? msg.slice(0, 40));
            resolve(null);
            return;
          }
          resolve({ exitCode: err.code ?? 1, stdout: stdout ?? "", stderr: stderr ?? "" });
          return;
        }
        resolve({ exitCode: 0, stdout, stderr });
      },
    );
  });
}
