/**
 * Output trimmer for forge_exec command results.
 *
 * Compression strategy:
 *   - Non-zero exit code → full output (Forge iron rule: failure output is never compressed)
 *   - Exit 0 + RTK available → RTK intelligent compression
 *   - Exit 0 + RTK unavailable → key line extraction fallback (trimCommandOutput)
 *
 * **Validates: Requirements 2.3, 2.4, 2.5**
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Regex matching key output lines (test results, errors, warnings, coverage). */
const KEY_LINE_PATTERN = /pass|fail|error|warn|coverage|✓|✗|PASS|FAIL|\d+ tests?/i;

/** Maximum number of key lines to include in trimmed output. */
const MAX_KEY_LINES = 15;

/** Line count threshold: outputs with more lines than this get trimmed. */
const TRIM_THRESHOLD = 30;

/** Number of trailing lines to always include in trimmed output. */
const TAIL_LINES = 5;

/** Timeout for RTK compression subprocess (ms). */
const RTK_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// RTK detection
// ---------------------------------------------------------------------------

/** Cached RTK availability result. */
let rtkCache: boolean | null = null;

/**
 * Check if the RTK (Rust Token Killer) binary is available in PATH.
 * Result is cached for the process lifetime.
 */
export async function isRtkAvailable(): Promise<boolean> {
  if (rtkCache !== null) return rtkCache;
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    await execFileAsync(cmd, ["rtk"], { timeout: 3000 });
    rtkCache = true;
  } catch {
    rtkCache = false;
  }
  return rtkCache;
}

// ---------------------------------------------------------------------------
// Legacy trimmer (@fallback — used when RTK is unavailable)
// ---------------------------------------------------------------------------

/**
 * Trim command output based on exit code and line count.
 *
 * @fallback This is the fallback compression engine when RTK is unavailable.
 *
 * @param stdout - Standard output from the command
 * @param stderr - Standard error from the command
 * @param exitCode - Process exit code
 * @returns Trimmed or full output string
 */
export function trimCommandOutput(stdout: string, stderr: string, exitCode: number): string {
  // Failure: return complete output (Forge iron rule)
  if (exitCode !== 0) {
    return stderr ? `${stdout}\n\nSTDERR:\n${stderr}` : stdout;
  }

  const lines = stdout.split("\n");

  // Small output: return directly
  if (lines.length <= TRIM_THRESHOLD) return stdout;

  // Large output: extract key lines + stats
  const keyLines = lines.filter((l) => KEY_LINE_PATTERN.test(l));

  return [
    `✅ exit:0 | ${lines.length} lines`,
    "--- key lines ---",
    ...keyLines.slice(0, MAX_KEY_LINES),
    "--- last 5 lines ---",
    ...lines.slice(-TAIL_LINES),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// RTK compression
// ---------------------------------------------------------------------------

/**
 * Compress output using RTK (Rust Token Killer).
 * Returns compressed output or null if compression fails.
 */
async function rtkCompress(stdout: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("rtk", ["compress"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: RTK_TIMEOUT_MS,
    });

    let out = "";
    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr.on("data", () => {}); // drain

    child.on("close", (code) => {
      if (code === 0 && out.trim()) {
        resolve(out.trim());
      } else {
        resolve(null);
      }
    });

    child.on("error", () => {
      resolve(null);
    });

    child.stdin.write(stdout);
    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Unified trim interface
// ---------------------------------------------------------------------------

/**
 * Trim command output with RTK-first, fallback-to-legacy strategy.
 *
 * Compression ladder:
 *   1. Non-zero exit → full output (Iron Law, always)
 *   2. Short output (≤30 lines) → return as-is
 *   3. RTK available → RTK compression (intelligent noise removal)
 *   4. RTK unavailable / failed → trimCommandOutput fallback
 *
 * @param stdout - Standard output from the command
 * @param stderr - Standard error from the command
 * @param exitCode - Process exit code
 * @param rtkAvailable - Whether RTK binary was detected in PATH
 * @returns Trimmed or full output string
 */
export async function trimWithFallback(
  stdout: string,
  stderr: string,
  exitCode: number,
  rtkAvailable: boolean,
): Promise<string> {
  // Iron Law: failure output is NEVER compressed
  if (exitCode !== 0) {
    return stderr ? `${stdout}\n\nSTDERR:\n${stderr}` : stdout;
  }

  // Small output: return directly
  const lines = stdout.split("\n");
  if (lines.length <= TRIM_THRESHOLD) return stdout;

  // Try RTK compression if available
  if (rtkAvailable) {
    const compressed = await rtkCompress(stdout);
    if (compressed && compressed.length < stdout.length) {
      return compressed;
    }
    // RTK failed or didn't compress — fall through to legacy
  }

  // Fallback: legacy key-line extraction
  return trimCommandOutput(stdout, stderr, exitCode);
}
