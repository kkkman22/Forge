// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const DELIMITER = "---";
const LF = "\n";
/**
 * Serializes a Frontmatter object back to a YAML frontmatter block.
 *
 * Field order: title → category → audience → updated → owner → mirror_of?
 * Arrays use block style (`- value`).
 * LF line endings. No trailing whitespace.
 * Closing `---` followed by exactly one LF + one empty line + body.
 */
export function serialize(fm, body) {
    const lines = [DELIMITER];
    // title
    lines.push(`title: ${quoteIfNeeded(fm.title)}`);
    // category
    lines.push(`category: ${fm.category}`);
    // audience (block style)
    lines.push("audience:");
    for (const item of fm.audience) {
        lines.push(`- ${item}`);
    }
    // updated — always quote to prevent YAML date parsing
    lines.push(`updated: '${fm.updated}'`);
    // owner
    lines.push(`owner: ${quoteIfNeeded(fm.owner)}`);
    // mirror_of (optional)
    if (fm.mirror_of !== undefined) {
        lines.push(`mirror_of: ${quoteIfNeeded(fm.mirror_of)}`);
    }
    lines.push(DELIMITER);
    let result = lines.join(LF) + LF;
    if (body !== undefined && body.length > 0) {
        // Closing --- + LF + empty line + body
        result += LF + body;
    }
    return result;
}
// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
/**
 * Quote a string value if it contains characters that YAML might
 * misinterpret (colon at end, leading special chars, etc.).
 */
function quoteIfNeeded(value) {
    // If already safe plain scalar, no quoting needed
    if (/^[A-Za-z0-9 _./-]+$/.test(value) && !value.endsWith(":") && !value.includes(": ")) {
        return value;
    }
    // Use single quotes; escape any internal single quotes
    return `'${value.replace(/'/g, "''")}'`;
}
//# sourceMappingURL=serializer.js.map