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

const VALID_MODES = new Set<SpecLayoutMode>(["three-file", "legacy", "experimental"]);

/**
 * Parse spec layout config from .tinkerman/config.md content.
 * Priority: FORGE_SPEC_LAYOUT env > config.md > default ("three-file").
 */
export function parseSpecLayoutConfig(configContent: string | undefined): SpecLayoutConfig {
  const DEFAULT: SpecLayoutMode = "three-file";

  // Env override
  const envValue = process.env.FORGE_SPEC_LAYOUT;
  if (envValue !== undefined) {
    const normalized = envValue.trim().toLowerCase();
    if (VALID_MODES.has(normalized as SpecLayoutMode)) {
      return { layout: normalized as SpecLayoutMode };
    }
  }

  // Config.md
  if (configContent) {
    const match = configContent.match(/^\s*spec_three_file_layout:\s*(.+)\s*$/m);
    if (match) {
      const value = match[1].trim().toLowerCase();
      if (VALID_MODES.has(value as SpecLayoutMode)) {
        return { layout: value as SpecLayoutMode };
      }
    }
  }

  return { layout: DEFAULT };
}
