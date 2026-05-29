/**
 * Pack config - parse project-level pack enablement from .forge/config.md.
 *
 * Reads YAML frontmatter `packs:` field, validates against PackRegistry,
 * deduplicates, preserves declaration order. Errors accumulate, never throw.
 *
 * Validates: R2.1-2.6 Project-level Pack enablement
 */
import { parse as parseYaml } from "yaml";
// ---------------------------------------------------------------------------
// Frontmatter extraction
// ---------------------------------------------------------------------------
/**
 * Extract YAML frontmatter from content. Returns the parsed object or empty.
 */
function extractFrontmatter(content) {
    const match = /^---\s*\n([\s\S]*?)\n---/.exec(content);
    if (!match)
        return {};
    try {
        const parsed = parseYaml(match[1]);
        if (parsed && typeof parsed === "object")
            return parsed;
        return {};
    }
    catch {
        return {};
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Parse .forge/config.md frontmatter to determine enabled packs.
 *
 * @param configContent - Raw .forge/config.md content
 * @param registry - Discovered PackRegistry
 * @param customLayerRoot - Absolute path to .forge/custom/
 * @returns Enabled packs with any validation errors
 *
 * @example
 * ```ts
 * const { enabled, errors } = parseEnabledPacks(config, registry, "/repo/.forge/custom");
 * if (errors.length > 0) console.error(errors);
 * ```
 */
export function parseEnabledPacks(configContent, registry, customLayerRoot) {
    const errors = [];
    const frontmatter = extractFrontmatter(configContent);
    const rawPacks = frontmatter.packs;
    if (rawPacks === undefined || rawPacks === null) {
        return {
            enabled: { order: [], entries: [], customLayerRoot },
            errors: [],
        };
    }
    if (!Array.isArray(rawPacks)) {
        return {
            enabled: { order: [], entries: [], customLayerRoot },
            errors: ["packs field must be a list of strings"],
        };
    }
    const seen = new Set();
    const order = [];
    const entries = [];
    for (const raw of rawPacks) {
        if (typeof raw !== "string") {
            errors.push(`pack name must be a string, got: ${typeof raw}`);
            continue;
        }
        const name = raw;
        // Deduplicate
        if (seen.has(name))
            continue;
        seen.add(name);
        // Validate exists in registry
        const entry = registry.packs.get(name);
        if (!entry) {
            errors.push(`pack not found: ${name}. Available packs: ${[...registry.packs.keys()].join(", ")}`);
            continue;
        }
        order.push(name);
        entries.push(entry);
    }
    return {
        enabled: { order, entries, customLayerRoot },
        errors,
    };
}
//# sourceMappingURL=config.js.map