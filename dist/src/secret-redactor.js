/**
 * Secret redactor for Forge artifacts and logs.
 *
 * Applies 4 regex patterns to redact sensitive values:
 *   (a) Bearer/Basic tokens (with or without "Authorization:" prefix)
 *   (b) JSON token fields (token, access_token, refresh_token)
 *   (c) Environment variable assignments for secret keys (quoted and unquoted)
 *   (d) Custom auth header values (X-API-Key, X-Auth-Token, Api-Key)
 *
 * **Validates: Requirement R12.11**
 */
/**
 * Redact sensitive values from text.
 *
 * Applies all 4 patterns in order, replacing matched secret
 * values with "***".
 */
export function redactSecrets(text) {
    let result = text;
    // (a) Bearer/Basic tokens — with or without "Authorization:" prefix
    result = result.replace(/((?:Authorization\s*:\s*)?(?:Bearer|Basic)\s+)\S+/gi, "$1***");
    // (b) JSON token fields: "token"/"access_token"/"refresh_token": "value"
    result = result.replace(/("(?:access_token|refresh_token|token)"\s*:\s*)"[^"]*"/gi, '$1"***"');
    // (c) Env var assignment: SECRET/KEY/TOKEN/PASSWORD/PRIVATE/DATABASE_URL/AUTH
    // Handles both quoted and unquoted values
    result = result.replace(/((?:export\s+)?[A-Z_]*(?:SECRET|KEY|TOKEN|PASSWORD|PRIVATE|DATABASE_URL|AUTH)[A-Z_]*)(\s*=\s*)("[^"]*"|\S+)/gi, "$1$2***");
    // (d) Custom auth headers: X-API-Key/X-Auth-Token/Api-Key: value
    result = result.replace(/(X-API-Key|X-Auth-Token|Api-Key)(\s*:\s*)\S+/gi, "$1$2***");
    return result;
}
//# sourceMappingURL=secret-redactor.js.map