/**
 * HTTP-probe / curl execution + verdict evaluation — extracted from
 * accept-driver.ts (P3-1).
 *
 * The "http-probe" responsibility (review §P3-1) maps to the curl/API-execution
 * + body-assertion + verdict-evaluation family. Originally lines 971-1219 of
 * accept-driver.ts. Also hosts the CLI verdict evaluator + generic exec
 * primitive (shared by api/cli/delegate runners in accept-driver.ts).
 */

import type { Verdict } from "../accept.js";

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

/** Status-only API verdict (back-compat path). Exported for apiRunner. */
export function evaluateApiVerdict(
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

/** CLI verdict evaluator. Exported for cliRunner in accept-driver.ts. */
export function evaluateCliVerdict(
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
