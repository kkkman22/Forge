/**
 * accept-credentials — placeholder resolution for acceptance scenarios. [Spec R4-AC1]
 *
 * Scenarios MUST NOT hardcode secrets; they use {{VAR}} placeholders resolved
 * at runtime from environment / .forge/secrets.env. [R4-AC2] resolved values
 * flow through stdin to agent-browser, never via argv.
 */

const PLACEHOLDER_RE = /\{\{([A-Z0-9_]+)\}\}/g;

/**
 * Resolve {{VAR}} placeholders in `value` against `env`.
 * Returns the substituted string, or null if a referenced var is missing.
 * Non-placeholder literals pass through unchanged.
 */
export function resolvePlaceholder(value: string, env: Record<string, string | undefined>): string | null {
  let missing = false;
  const out = value.replace(PLACEHOLDER_RE, (_m, name: string) => {
    const v = env[name];
    if (v === undefined || v === "") {
      missing = true;
      return "";
    }
    return v;
  });
  return missing ? null : out;
}

/**
 * Batch-resolve a record of placeholders.
 * Returns the resolved values plus the list of missing var names.
 */
export function resolveSecrets(
  inputs: Record<string, string>,
  env: Record<string, string | undefined>,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const [key, raw] of Object.entries(inputs)) {
    const resolved = resolvePlaceholder(raw, env);
    if (resolved === null) {
      // collect missing var names referenced
      const matches = [...raw.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
      missing.push(...matches.filter((n) => env[n] === undefined || env[n] === ""));
      values[key] = raw; // leave raw; caller decides
    } else {
      values[key] = resolved;
    }
  }
  return { values, missing: [...new Set(missing)] };
}

/** Extract {{VAR}} placeholder names from a string. */
export function extractPlaceholderNames(value: string): string[] {
  return [...new Set([...value.matchAll(PLACEHOLDER_RE)].map((m) => m[1]))];
}
