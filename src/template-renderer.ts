export type TemplateValue =
  | string
  | string[]
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

export interface TemplateContext {
  [placeholder: string]: TemplateValue;
}

export interface TemplateRenderResult {
  content: string;
  unresolvedPlaceholders: string[];
  outputSuggestedPath: string;
}

const SAFE_KEY_RE = /^\w+$/;

/** Maximum total key length for a placeholder path */
const MAX_KEY_LENGTH = 128;
/** Maximum length per dot-separated segment */
const MAX_SEGMENT_LENGTH = 64;

/**
 * Resolve a dot-notated path against a value, e.g. "this.name" on { name: "A" } => "A".
 * Validates each path segment to prevent prototype pollution and enforces length limits.
 */
function resolvePath(value: unknown, path: string): unknown {
  if (path.length > MAX_KEY_LENGTH) return undefined;
  const parts = path.split(".");
  let current: unknown = value;
  for (const part of parts) {
    if (part.length > MAX_SEGMENT_LENGTH) return undefined;
    if (!SAFE_KEY_RE.test(part)) return undefined;
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * Internal recursive renderer. Returns [rendered content, unresolved placeholders].
 */
function renderInternal(
  template: string,
  context: TemplateContext,
  localContext: Record<string, unknown>,
): [string, string[]] {
  let result = template;
  const unresolved: string[] = [];

  // 1. Process {{#each key}}...{{/each}} blocks
  const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  result = result.replace(eachRegex, (_match, key: string, body: string) => {
    const arr = localContext[key] ?? context[key];
    if (!Array.isArray(arr)) return "";
    const parts: string[] = [];
    for (const item of arr) {
      const [rendered, itemUnresolved] = renderInternal(body, context, {
        ...localContext,
        this: item,
      });
      parts.push(rendered);
      unresolved.push(...itemUnresolved);
    }
    return parts.join("");
  });

  // 2. Process {{#if key}}...{{/if}} blocks
  const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (_match, key: string, body: string) => {
    const value = localContext[key] ?? context[key];
    if (!isTruthy(value)) return "";
    const [rendered, ifUnresolved] = renderInternal(body, context, localContext);
    unresolved.push(...ifUnresolved);
    return rendered;
  });

  // 3. Process simple {{placeholder}} replacements
  const simpleRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
  result = result.replace(simpleRegex, (_match, path: string) => {
    // Try localContext first (for "this.name" style access inside #each)
    const localValue = resolvePath(localContext, path);
    if (localValue !== undefined) return stringify(localValue);

    // Then try top-level context
    const contextValue = resolvePath(context, path);
    if (contextValue !== undefined) return stringify(contextValue);

    // Not resolved — record it
    unresolved.push(path);
    return "";
  });

  return [result, unresolved];
}

export function renderTemplate(template: string, context: TemplateContext): TemplateRenderResult {
  const [content, unresolvedPlaceholders] = renderInternal(template, context, {});

  // Derive output path from AggregateName
  const aggregateName = context.AggregateName;
  let outputSuggestedPath = "";
  if (typeof aggregateName === "string" && aggregateName.length > 0) {
    outputSuggestedPath = `src/domain/${aggregateName}/${aggregateName}.ts`;
  }

  // Deduplicate unresolved placeholders
  const uniqueUnresolved = [...new Set(unresolvedPlaceholders)];

  return {
    content,
    unresolvedPlaceholders: uniqueUnresolved,
    outputSuggestedPath,
  };
}
