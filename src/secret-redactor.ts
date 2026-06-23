/**
 * Secret redactor for Forge artifacts and logs.
 *
 * Applies 7 regex patterns to redact sensitive values:
 *   (a) Bearer/Basic tokens (with or without "Authorization:" prefix)
 *   (b) JSON secret fields (token, access_token, refresh_token, apikey, api_key,
 *       secret, private_key) — case-insensitive to cover lowercase JSON
 *   (c) Environment variable assignments for secret keys (quoted and unquoted)
 *   (d) Custom auth header values (X-API-Key, X-Auth-Token, Api-Key)
 *   (e) PEM private key blocks (-----BEGIN ... PRIVATE KEY----- ... END)
 *   (f) Bare JWT tokens (eyJ...\.eyJ...\.[A-Za-z0-9_-]+ three-segment form)
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

  // (e) PEM private key block — redact FIRST so its multiline body is removed
  // before single-line patterns can match fragments inside it. Certificates
  // (BEGIN CERTIFICATE) are public and intentionally NOT matched here.
  result = result.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "***");

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

  // (f) Bare JWT — three dot-separated base64url segments starting with eyJ.
  // Anchored on the eyJ prefix to avoid false positives on arbitrary text.
  result = result.replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "***");

  return result;
}
