/**
 * Spec lifecycle management module.
 *
 * Defines the spec status enum, frontmatter schema, parsing, and validation
 * for `.kiro/specs/` directory lifecycle management.
 *
 * **Validates: spec-lifecycle-management requirements 1, 2**
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_STATUSES = new Set([
    "draft",
    "approved",
    "in_progress",
    "completed",
    "deferred",
    "archived",
]);
const VALID_PRIORITIES = new Set(["P1", "P2", "P3"]);
const VALID_TIERS = new Set(["light", "standard", "full"]);
/** ISO date regex (YYYY-MM-DD). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Parse spec frontmatter from a requirements.md content string.
 * Returns null if no valid frontmatter with a name field is found.
 */
export function parseSpecFrontmatter(content) {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith("---")) {
        return null;
    }
    const afterFirst = trimmed.slice("---".length);
    const closingIndex = afterFirst.indexOf("\n---");
    if (closingIndex === -1) {
        return null;
    }
    const raw = afterFirst.slice(0, closingIndex);
    const name = extractStringField(raw, "name");
    if (!name) {
        return null;
    }
    const status = (extractStringField(raw, "status") ?? "in_progress");
    const created = extractStringField(raw, "created") ?? "";
    const updated = extractStringField(raw, "updated") ?? "";
    const priorityRaw = extractStringField(raw, "priority");
    const tierRaw = extractStringField(raw, "tier");
    const depends_on = extractListField(raw, "depends_on");
    const replaces = extractListField(raw, "replaces");
    const replaced_by = extractListField(raw, "replaced_by");
    const deferred_reason = extractStringField(raw, "deferred_reason") ?? undefined;
    const deferred_date = extractStringField(raw, "deferred_date") ?? undefined;
    return {
        name,
        status,
        created,
        updated,
        priority: priorityRaw && VALID_PRIORITIES.has(priorityRaw) ? priorityRaw : undefined,
        tier: tierRaw && VALID_TIERS.has(tierRaw) ? tierRaw : undefined,
        depends_on,
        replaces,
        replaced_by,
        deferred_reason,
        deferred_date,
    };
}
/**
 * Validate a SpecFrontmatter object against the schema.
 * Returns a ValidationResult with valid flag and any error messages.
 */
export function validateSpecFrontmatter(fm) {
    const errors = [];
    // Required fields
    if (!fm.name || fm.name.trim().length === 0) {
        errors.push("Missing required field: name");
    }
    else if (!/^[a-z][a-z0-9-]*$/.test(fm.name)) {
        errors.push(`Invalid name format: "${fm.name}" (must be kebab-case)`);
    }
    if (!fm.status || !VALID_STATUSES.has(fm.status)) {
        errors.push(`Invalid status: "${fm.status}" (must be one of: ${[...VALID_STATUSES].join(", ")})`);
    }
    if (!fm.created || !ISO_DATE_RE.test(fm.created)) {
        errors.push(`Invalid created date: "${fm.created}" (must be YYYY-MM-DD)`);
    }
    if (!fm.updated || !ISO_DATE_RE.test(fm.updated)) {
        errors.push(`Invalid updated date: "${fm.updated}" (must be YYYY-MM-DD)`);
    }
    // Optional field validation
    if (fm.priority && !VALID_PRIORITIES.has(fm.priority)) {
        errors.push(`Invalid priority: "${fm.priority}" (must be P1, P2, or P3)`);
    }
    if (fm.tier && !VALID_TIERS.has(fm.tier)) {
        errors.push(`Invalid tier: "${fm.tier}" (must be light, standard, or full)`);
    }
    // Conditional validation for deferred status
    if (fm.status === "deferred") {
        if (!fm.deferred_reason || fm.deferred_reason.trim().length === 0) {
            errors.push("Missing required field: deferred_reason (required when status is deferred)");
        }
        if (!fm.deferred_date || !ISO_DATE_RE.test(fm.deferred_date)) {
            errors.push(`Invalid deferred_date: "${fm.deferred_date}" (must be YYYY-MM-DD, required when status is deferred)`);
        }
    }
    return { valid: errors.length === 0, errors };
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function extractStringField(frontmatter, fieldName) {
    const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped}:\\s*"?([^"\\n]*)"?\\s*$`, "m");
    const match = frontmatter.match(regex);
    return match ? match[1].trim() : null;
}
function extractListField(frontmatter, fieldName) {
    const lines = frontmatter.split("\n");
    let collecting = false;
    const items = [];
    for (const line of lines) {
        if (!collecting) {
            const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const headerPattern = new RegExp(`^${escaped}:\\s*$`);
            if (headerPattern.test(line)) {
                collecting = true;
                continue;
            }
            const emptyArrayPattern = new RegExp(`^${escaped}:\\s*\\[\\]\\s*$`);
            if (emptyArrayPattern.test(line)) {
                return [];
            }
            continue;
        }
        const itemMatch = line.match(/^\s+-\s+(.+)$/);
        if (itemMatch) {
            items.push(itemMatch[1].trim());
        }
        else if (line.trim() === "") {
            // skip blank lines within list
        }
        else {
            break;
        }
    }
    return items;
}
//# sourceMappingURL=spec-lifecycle.js.map