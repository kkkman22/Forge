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
export declare function redactSecrets(text: string): string;
