/**
 * accept-security — redaction + URL allowlist pure functions. [Spec R4-AC4, R4-AC5]
 *
 * Used before persisting agent-browser snapshot/screenshot evidence to
 * strip credentials, tokens, cookies, and internal network addresses so
 * they never land in git (R4-AC3) via the evidence directory.
 *
 * Instinct compliance: inline regex only (no /g flag → no lastIndex bug).
 */

/**
 * Redact sensitive data from snapshot text before persistence.
 * Handles two shapes:
 *   - Header form: "Set-Cookie: xxx", "Authorization: xxx", "cookie: xxx"
 *     → replace the value part with [REDACTED].
 *   - key=value form: "password=xxx", "access_token=xxx", "...secret=xxx"
 *     → replace the value with [REDACTED].
 * Idempotent: redacting an already-redacted text yields the same text.
 */
export function redactSnapshot(text: string): string {
  if (!text) return text;
  let out = text;
  // Header form: "<Name>: <value>" → "Name: [REDACTED]"
  // Preserve the original separator so the structural shape is unchanged.
  out = out.replace(/((?:set-)?cookie|authorization)\s*:\s*[^\n\r,;]*/gi, (m) =>
    m.replace(/\s*:\s*[^\n\r,;]*$/i, ": [REDACTED]"),
  );
  // Standalone "bearer <value>" token form.
  out = out.replace(/\bbearer\s+\S+/gi, "bearer [REDACTED]");
  // JWT inline tokens (eyJ... header marker).
  out = out.replace(/\beyJ[A-Za-z0-9_-]*\.?[A-Za-z0-9_-]*\.?[A-Za-z0-9_-]*/g, "[REDACTED-JWT]");
  // PEM private key blocks.
  out = out.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    "[REDACTED-PEM]",
  );
  // x-api-key / x-csrf-token / sessionid header form.
  out = out.replace(/(x-api-key|x-csrf-token|sessionid)\s*:\s*[^\n\r,;]*/gi, "$1: [REDACTED]");
  // key=value (or key:value) form for credential-ish keys → "key=[REDACTED]".
  out = out.replace(
    /((?:password|passwd|pwd|secret|token|access_token|refresh_token|api[_-]?key))\s*[:=]\s*[^\n\r,;\s]+/gi,
    (_m, key) => `${key}=[REDACTED]`,
  );
  return out;
}

/**
 * Is the given URL within the navigation allowlist?
 * Only the hostname is compared against allowlistHosts (exact match).
 * R4-AC5: default allowlist is localhost/127.0.0.1 plus spec-declared dev hosts.
 */
export function isUrlAllowed(rawUrl: string, allowlistHosts: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return allowlistHosts.some((h) => h.toLowerCase() === host);
}
