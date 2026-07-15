/**
 * Secret redactor for Forge artifacts and logs.
 *
 * Applies 8 regex pattern groups to redact sensitive values:
 *   (a) Bearer/Basic tokens (with or without "Authorization:" prefix)
 *   (b) JSON secret fields (token, access_token, refresh_token, apikey, api_key,
 *       secret, private_key) — case-insensitive to cover lowercase JSON
 *   (c) Environment variable assignments for secret keys (quoted and unquoted)
 *   (d) Custom auth header values (X-API-Key, X-Auth-Token, Api-Key)
 *   (e) PEM private key blocks (-----BEGIN ... PRIVATE KEY----- ... END)
 *   (f) Bare JWT tokens (eyJ...\.eyJ...\.[A-Za-z0-9_-]+ three-segment form)
 *   (g) Bare vendor tokens in free text: OpenAI sk-, GitHub ghp_, AWS AKIA
 *   (h) Bare DSNs with embedded passwords: postgres/mysql/mongodb, Sentry-style
 *
 * **Validates: Requirement R12.11**
 */

/**
 * Redact sensitive values from text.
 *
 * Applies all patterns in order, replacing matched secret
 * values with "***".
 */
export function redactSecrets(text: string): string {
  let result = text;

  // (e) PEM/PGP private key block — redact FIRST so its multiline body is
  // removed before single-line patterns can match fragments inside it.
  // Covers RSA/EC/OPENSSH/ENCRYPTED PRIVATE KEY and PGP PRIVATE KEY BLOCK.
  // Certificates (BEGIN CERTIFICATE) are public and intentionally NOT matched.
  // Two passes: complete BEGIN..END block first, then a header-only fallback
  // for a key truncated before its END footer (log line-limit, partial paste)
  // so the base64 body does not leak.
  const PRIV_KEY = "[A-Z ]*(?:PRIVATE KEY(?: BLOCK)?)";
  result = result.replace(
    new RegExp(`-----BEGIN ${PRIV_KEY}-----[\\s\\S]*?-----END ${PRIV_KEY}-----`, "g"),
    "***",
  );
  result = result.replace(
    new RegExp(
      `-----BEGIN ${PRIV_KEY}-----[^\\n]*\\n(?:[A-Za-z0-9+/= \\t]*\\n)*[A-Za-z0-9+/= \\t]+`,
    ),
    "***",
  );

  // (a) Bearer/Basic tokens — with or without "Authorization:" prefix
  result = result.replace(/((?:Authorization\s*:\s*)?(?:Bearer|Basic)\s+)\S+/gi, "$1***");

  // (b) JSON secret fields: "token"/"access_token"/"refresh_token"/"apikey"/
  // "api_key"/"secret"/"private_key": "value" — case-insensitive for lowercase
  // JSON producers.
  result = result.replace(
    /("(?:access_token|refresh_token|token|apikey|api_key|secret|private_key)"\s*:\s*)"[^"]*"/gi,
    '$1"***"',
  );

  // (c) Env var assignment: SECRET/KEY/TOKEN/PASSWORD/PRIVATE/DATABASE_URL/AUTH
  // Handles both quoted and unquoted values
  result = result.replace(
    /((?:export\s+)?[A-Z_]*(?:SECRET|KEY|TOKEN|PASSWORD|PRIVATE|DATABASE_URL|AUTH)[A-Z_]*)(\s*=\s*)("[^"]*"|\S+)/gi,
    "$1$2***",
  );

  // (d) Custom auth headers: X-API-Key/X-Auth-Token/Api-Key: value
  result = result.replace(/(X-API-Key|X-Auth-Token|Api-Key)(\s*:\s*)\S+/gi, "$1$2***");

  // (f) Bare JWT — three dot-separated base64url segments. The header segment
  // is anchored on the eyJ prefix (a base64url-encoded "{" JSON object) to
  // avoid false positives; the payload segment may start with any base64url
  // char (a payload whose first JSON key is "" base64-encodes to eyI, not eyJ).
  result = result.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "***");

  // (g) Audit P2: bare vendor tokens & DSNs in free text (no context anchor).
  // The context-bound patterns above (JSON field / env assign / Bearer prefix)
  // miss these in loose error strings that flow into git-tracked artifacts.
  //   - OpenAI secret keys: sk-proj... / sk-... (20+ alphanumerics)
  //   - GitHub PATs: ghp_ / gho_ / ghs_ / ghu_ / ghr_ / glr_ (36+ chars)
  //   - AWS access-key IDs: AKIA followed by 16 uppercase alphanumerics
  result = result.replace(/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, "***");
  result = result.replace(/gh[pousrl]_[A-Za-z0-9]{36,}/g, "***");
  result = result.replace(/AKIA[0-9A-Z]{16}/g, "***");

  // (h) Audit P2: bare connection strings with embedded credentials.
  //   - Postgres/MySQL DSN: scheme://user:password@host — redact the
  //     user:password@ segment.
  //   - Sentry-style DSN: https://<pubkey>:<secret>@host/<id> or
  //     https://<pubkey>@host/<id> (ingest DSNs carry no colon-secret).
  result = result.replace(/(postgres(?:ql)?|mysql|mongodb(?:\+srv)?:\/\/)[^\s@"']+:[^\s@"']+@/gi, "$1***@");
  result = result.replace(/(https?:\/\/)[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?@[\w.-]+\/\d+/gi, "$1***@");

  return result;
}
