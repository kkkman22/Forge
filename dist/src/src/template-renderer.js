const SAFE_KEY_RE = /^\w+$/;
/**
 * Resolve a dot-notated path against a value, e.g. "this.name" on { name: "A" } => "A".
 * Validates each path segment to prevent prototype pollution.
 */
function resolvePath(value, path) {
    const parts = path.split(".");
    let current = value;
    for (const part of parts) {
        if (!SAFE_KEY_RE.test(part))
            return undefined;
        if (current == null || typeof current !== "object")
            return undefined;
        current = current[part];
    }
    return current;
}
function isTruthy(value) {
    if (value == null)
        return false;
    if (typeof value === "string")
        return value.length > 0;
    if (Array.isArray(value))
        return value.length > 0;
    return true;
}
function stringify(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value;
    return String(value);
}
/**
 * Internal recursive renderer. Returns [rendered content, unresolved placeholders].
 */
function renderInternal(template, context, localContext) {
    let result = template;
    const unresolved = [];
    // 1. Process {{#each key}}...{{/each}} blocks
    const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    result = result.replace(eachRegex, (_match, key, body) => {
        const arr = localContext[key] ?? context[key];
        if (!Array.isArray(arr))
            return "";
        const parts = [];
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
    result = result.replace(ifRegex, (_match, key, body) => {
        const value = localContext[key] ?? context[key];
        if (!isTruthy(value))
            return "";
        const [rendered, ifUnresolved] = renderInternal(body, context, localContext);
        unresolved.push(...ifUnresolved);
        return rendered;
    });
    // 3. Process simple {{placeholder}} replacements
    const simpleRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    result = result.replace(simpleRegex, (_match, path) => {
        // Try localContext first (for "this.name" style access inside #each)
        const localValue = resolvePath(localContext, path);
        if (localValue !== undefined)
            return stringify(localValue);
        // Then try top-level context
        const contextValue = resolvePath(context, path);
        if (contextValue !== undefined)
            return stringify(contextValue);
        // Not resolved — record it
        unresolved.push(path);
        return "";
    });
    return [result, unresolved];
}
export function renderTemplate(template, context) {
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
//# sourceMappingURL=template-renderer.js.map