/**
 * Pack commands - 7 subcommands for forge-pack skill.
 *
 * Pure functions returning output + file modifications. Skill driver handles IO.
 *
 * Validates: R4.1-4.9 Pack management commands
 */
import type { EnabledPacks, PackRegistry } from "./types.js";
/** List all packs with enabled status. */
export declare function commandList(registry: PackRegistry, enabled: EnabledPacks): string;
/** Enable a pack by adding it to .forge/config.md frontmatter. */
export declare function commandEnable(name: string, config: string, registry: PackRegistry): {
    newConfig: string;
    message: string;
} | {
    error: string;
};
/** Disable a pack by removing it from .forge/config.md frontmatter. */
export declare function commandDisable(name: string, config: string): {
    newConfig: string;
    message: string;
};
/** Inspect a pack's manifest and category counts. */
export declare function commandInspect(name: string, registry: PackRegistry): string;
/** Copy a pack file to custom layer for override. */
export declare function commandOverride(relativePath: string, enabled: EnabledPacks, _force: boolean): {
    sourcePath: string;
    targetPath: string;
} | {
    error: string;
};
/** Validation report for a pack. */
export interface ValidationReport {
    passed: boolean;
    pack: string;
    checks: Array<{
        check: string;
        passed: boolean;
        detail?: string;
    }>;
}
/** Validate a pack's structure. */
export declare function commandValidate(name: string | null, registry: PackRegistry): ValidationReport;
/** Scaffold a new pack directory. */
export declare function commandNew(name: string): {
    files: Array<{
        path: string;
        content: string;
    }>;
};
