/**
 * Spec layout configuration — reads spec_three_file_layout from config.md.
 *
 * Three modes:
 *   - "three-file" (default): New specs use three-file layout
 *   - "legacy": Keep using single-file spec.md
 *   - "experimental": Both layouts coexist, prefer three-file
 *
 * Validates: Requirement 12
 */
export type SpecLayoutMode = "three-file" | "legacy" | "experimental";
export interface SpecLayoutConfig {
    layout: SpecLayoutMode;
}
/**
 * Parse spec layout config from .forge/config.md content.
 * Priority: FORGE_SPEC_LAYOUT env > config.md > default ("three-file").
 */
export declare function parseSpecLayoutConfig(configContent: string | undefined): SpecLayoutConfig;
