/**
 * Pack config - parse project-level pack enablement from .forge/config.md.
 *
 * Reads YAML frontmatter `packs:` field, validates against PackRegistry,
 * deduplicates, preserves declaration order. Errors accumulate, never throw.
 *
 * Validates: R2.1-2.6 Project-level Pack enablement
 */
import type { EnabledPacks, PackRegistry } from "./types.js";
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
export declare function parseEnabledPacks(configContent: string, registry: PackRegistry, customLayerRoot: string): {
    enabled: EnabledPacks;
    errors: string[];
};
