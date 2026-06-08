/**
 * StatusFile extension fields — pure functions for managing
 * Loop-related fields in the StatusFile YAML frontmatter.
 *
 * All functions are pure: they accept data and return results without
 * side effects. The SKILL layer is responsible for actual I/O.
 *
 * Design reference: loop-skills-fusion § status-file-ext.ts
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
 */

import type { ExecutionMode } from "./execution-mode.js";
import type { PressureLevel } from "./pua-engine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Loop-related StatusFile extension fields. */
export interface LoopStatusFields {
  /** Execution mode: interactive or autonomous. */
  mode?: ExecutionMode;
  /** Unique identifier for the current Loop run. */
  loopRunId?: string;
  /** Current Loop iteration number. */
  loopIteration?: number;
  /** Ordered skill sequence from routing (e.g. ["plan","build","review","test","ship"]). */
  skillSequence?: string[];
  /** Work nature: feature, refactor, or bugfix. */
  workNature?: string;
}

/** Package-related StatusFile extension fields. */
export interface PackageStatusFields {
  currentPackage?: string;
  completedPackages?: string[];
  nextPackage?: string;
  packageCount?: number;
}

/** PUA-related StatusFile extension fields. */
export interface PuaStatusFields {
  /** Current pressure level (L0-L4). */
  puaPressureLevel?: PressureLevel;
  /** Current methodology identifier. */
  puaMethodology?: string;
  /** Current position in the methodology switch chain. */
  puaChainIndex?: number;
  /** Most recently detected failure pattern. */
  puaFailurePattern?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** YAML frontmatter delimiter. */
const FRONTMATTER_DELIMITER = "---";

/** Field names in the YAML frontmatter that correspond to Loop fields. */
const LOOP_FIELD_PATTERNS: readonly RegExp[] = [
  /^mode:\s/,
  /^loop_run_id:\s/,
  /^loop_iteration:\s/,
  /^skill_sequence:\s/,
  /^work_nature:\s/,
];

const PACKAGE_FIELD_PATTERNS: readonly RegExp[] = [
  /^current_package:\s/,
  /^completed_packages:\s/,
  /^next_package:\s/,
  /^package_count:\s/,
];

/** Valid execution mode values. */
const VALID_MODES: ReadonlySet<string> = new Set(["interactive", "autonomous"]);

/** Regex matching any PUA field line (pua_ prefix). */
const PUA_FIELD_PATTERN = /^pua_\w+:\s/;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from StatusFile content.
 * Returns the frontmatter block (without delimiters) and the body after it.
 * Returns null if no valid frontmatter is found.
 */
function parseFrontmatter(content: string): {
  frontmatter: string;
  body: string;
  leadingWhitespace: string;
} | null {
  const trimmed = content.trimStart();
  const leadingWhitespace = content.slice(0, content.length - trimmed.length);

  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return null;
  }

  const afterFirst = trimmed.slice(FRONTMATTER_DELIMITER.length);
  const closingIndex = afterFirst.indexOf(`\n${FRONTMATTER_DELIMITER}`);
  if (closingIndex === -1) {
    return null;
  }

  const frontmatter = afterFirst.slice(0, closingIndex);
  const afterClosing = afterFirst.slice(closingIndex + 1 + FRONTMATTER_DELIMITER.length);

  // Body starts after the closing delimiter line
  const bodyStart = afterClosing.indexOf("\n");
  const body = bodyStart === -1 ? "" : afterClosing.slice(bodyStart + 1);

  return { frontmatter, body, leadingWhitespace };
}

/**
 * Reconstruct StatusFile content from frontmatter lines and body.
 */
function buildContent(frontmatterLines: string[], body: string, leadingWhitespace: string): string {
  const fm = frontmatterLines.filter((line) => line.trim() !== "").join("\n");
  const frontmatterBlock = `${FRONTMATTER_DELIMITER}\n${fm}\n${FRONTMATTER_DELIMITER}`;
  if (body) {
    return `${leadingWhitespace}${frontmatterBlock}\n${body}`;
  }
  return `${leadingWhitespace}${frontmatterBlock}\n`;
}

/**
 * Parse frontmatter into individual lines, filtering out empty lines.
 */
function getFrontmatterLines(frontmatter: string): string[] {
  return frontmatter.split("\n").filter((line) => line.trim() !== "");
}

/**
 * Check if a frontmatter line matches any Loop field pattern.
 */
function isLoopFieldLine(line: string): boolean {
  return LOOP_FIELD_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Find the index of a line matching a given pattern, or -1 if not found.
 */
function findLineIndex(lines: string[], pattern: RegExp): number {
  return lines.findIndex((line) => pattern.test(line));
}

/**
 * Set or update a field in the frontmatter lines array.
 */
function setField(lines: string[], pattern: RegExp, newLine: string): string[] {
  const idx = findLineIndex(lines, pattern);
  if (idx !== -1) {
    lines[idx] = newLine;
  } else {
    lines.push(newLine);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract Loop-related fields from StatusFile content.
 *
 * Parses the YAML frontmatter and extracts `mode`, `loop_run_id`,
 * `loop_iteration`, and `skill_sequence` fields. Returns `undefined`
 * for any missing or unparseable fields.
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns Extracted Loop status fields.
 */
export function extractLoopFields(statusContent: string): LoopStatusFields {
  const result: LoopStatusFields = {};

  const parsed = parseFrontmatter(statusContent);
  if (!parsed) {
    return result;
  }

  // Extract mode
  const modeMatch = parsed.frontmatter.match(/^mode:\s*"?([^"\n]*)"?\s*$/m);
  if (modeMatch) {
    const value = modeMatch[1].trim();
    if (VALID_MODES.has(value)) {
      result.mode = value as ExecutionMode;
    }
  }

  // Extract loop_run_id
  const runIdMatch = parsed.frontmatter.match(/^loop_run_id:\s*"?([^"\n]*)"?\s*$/m);
  if (runIdMatch) {
    const value = runIdMatch[1].trim();
    if (value) {
      result.loopRunId = value;
    }
  }

  // Extract loop_iteration
  const iterMatch = parsed.frontmatter.match(/^loop_iteration:\s*(\d+)\s*$/m);
  if (iterMatch) {
    result.loopIteration = Number.parseInt(iterMatch[1], 10);
  }

  // Extract skill_sequence (comma-separated string → string[])
  const seqMatch = parsed.frontmatter.match(/^skill_sequence:\s*"?([^"\n]*)"?\s*$/m);
  if (seqMatch) {
    const value = seqMatch[1].trim();
    if (value) {
      result.skillSequence = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    }
  }

  // Extract work_nature
  const workNatureMatch = parsed.frontmatter.match(/^work_nature:\s*"?([^"\n]*)"?\s*$/m);
  if (workNatureMatch) {
    const value = workNatureMatch[1].trim();
    if (value) {
      result.workNature = value;
    }
  }

  return result;
}

/**
 * Write Loop-related fields into StatusFile content.
 *
 * If the content has valid YAML frontmatter, updates or adds the Loop fields.
 * If the content has no frontmatter, creates new frontmatter with the fields.
 * Preserves all other fields in the frontmatter.
 *
 * @param statusContent - Raw StatusFile content string.
 * @param fields - Loop status fields to write.
 * @returns Updated StatusFile content string.
 */
export function writeLoopFields(statusContent: string, fields: LoopStatusFields): string {
  const parsed = parseFrontmatter(statusContent);

  if (!parsed) {
    // No frontmatter — create one with the Loop fields
    const newLines: string[] = [];
    if (fields.mode !== undefined) {
      newLines.push(`mode: "${fields.mode}"`);
    }
    if (fields.loopRunId !== undefined) {
      newLines.push(`loop_run_id: "${fields.loopRunId}"`);
    }
    if (fields.loopIteration !== undefined) {
      newLines.push(`loop_iteration: ${fields.loopIteration}`);
    }
    if (fields.skillSequence !== undefined) {
      newLines.push(`skill_sequence: "${fields.skillSequence.join(",")}"`);
    }
    if (fields.workNature !== undefined) {
      newLines.push(`work_nature: "${fields.workNature}"`);
    }

    if (newLines.length === 0) {
      return statusContent;
    }

    const trimmed = statusContent.trimStart();
    const fm = newLines.join("\n");
    return `${FRONTMATTER_DELIMITER}\n${fm}\n${FRONTMATTER_DELIMITER}\n${trimmed}`;
  }

  const lines = getFrontmatterLines(parsed.frontmatter);

  if (fields.mode !== undefined) {
    setField(lines, /^mode:\s/, `mode: "${fields.mode}"`);
  }
  if (fields.loopRunId !== undefined) {
    setField(lines, /^loop_run_id:\s/, `loop_run_id: "${fields.loopRunId}"`);
  }
  if (fields.loopIteration !== undefined) {
    setField(lines, /^loop_iteration:\s/, `loop_iteration: ${fields.loopIteration}`);
  }
  if (fields.skillSequence !== undefined) {
    setField(lines, /^skill_sequence:\s/, `skill_sequence: "${fields.skillSequence.join(",")}"`);
  }
  if (fields.workNature !== undefined) {
    setField(lines, /^work_nature:\s/, `work_nature: "${fields.workNature}"`);
  }

  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}

/**
 * Remove all Loop-related fields from StatusFile content.
 *
 * Removes `mode`, `loop_run_id`, `loop_iteration`, and `skill_sequence`
 * fields from the YAML frontmatter. Preserves all other fields.
 * If no frontmatter exists, returns content unchanged.
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns Updated StatusFile content string with Loop fields removed.
 */
export function clearLoopFields(statusContent: string): string {
  const parsed = parseFrontmatter(statusContent);

  if (!parsed) {
    return statusContent;
  }

  const lines = getFrontmatterLines(parsed.frontmatter);
  const filtered = lines.filter((line) => !isLoopFieldLine(line));

  return buildContent(filtered, parsed.body, parsed.leadingWhitespace);
}

/**
 * Update the `phase` and `loop_iteration` fields in StatusFile content.
 *
 * Used after each iteration completes to reflect the latest state.
 * Creates frontmatter if missing.
 *
 * @param statusContent - Raw StatusFile content string.
 * @param phase - The current SKILL phase identifier.
 * @param iteration - The current Loop iteration number.
 * @returns Updated StatusFile content string.
 */
export function updateIterationStatus(
  statusContent: string,
  phase: string,
  iteration: number,
): string {
  const parsed = parseFrontmatter(statusContent);

  if (!parsed) {
    // No frontmatter — create one with phase and loop_iteration
    const trimmed = statusContent.trimStart();
    const fm = `phase: "${phase}"\nloop_iteration: ${iteration}`;
    return `${FRONTMATTER_DELIMITER}\n${fm}\n${FRONTMATTER_DELIMITER}\n${trimmed}`;
  }

  const lines = getFrontmatterLines(parsed.frontmatter);

  setField(lines, /^phase:\s/, `phase: "${phase}"`);
  setField(lines, /^loop_iteration:\s/, `loop_iteration: ${iteration}`);

  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}

// ---------------------------------------------------------------------------
// PUA StatusFile extension fields
// ---------------------------------------------------------------------------

/** Valid PressureLevel values for parsing. */
const VALID_PRESSURE_LEVELS: ReadonlySet<string> = new Set(["L0", "L1", "L2", "L3", "L4"]);

/**
 * Extract PUA-related fields from StatusFile content.
 *
 * Parses the YAML frontmatter and extracts `pua_pressure_level`,
 * `pua_methodology`, `pua_chain_index`, and `pua_failure_pattern` fields.
 * Returns `undefined` for any missing or unparseable fields.
 *
 * When unable to parse (empty string, invalid YAML, corrupted content),
 * returns default values (all fields `undefined`) without throwing.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.7, 10.1, 10.2, 10.3, 10.4, 10.8**
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns Extracted PUA status fields.
 */
export function extractPuaFields(statusContent: string): PuaStatusFields {
  const result: PuaStatusFields = {};

  const parsed = parseFrontmatter(statusContent);
  if (!parsed) {
    return result;
  }

  // Extract pua_pressure_level
  const levelMatch = parsed.frontmatter.match(/^pua_pressure_level:\s*"?([^"\n]*)"?\s*$/m);
  if (levelMatch) {
    const value = levelMatch[1].trim();
    if (VALID_PRESSURE_LEVELS.has(value)) {
      result.puaPressureLevel = value as PressureLevel;
    }
  }

  // Extract pua_methodology
  const methodMatch = parsed.frontmatter.match(/^pua_methodology:\s*"?([^"\n]*)"?\s*$/m);
  if (methodMatch) {
    const value = methodMatch[1].trim();
    if (value) {
      result.puaMethodology = value;
    }
  }

  // Extract pua_chain_index
  const chainMatch = parsed.frontmatter.match(/^pua_chain_index:\s*(\d+)\s*$/m);
  if (chainMatch) {
    result.puaChainIndex = Number.parseInt(chainMatch[1], 10);
  }

  // Extract pua_failure_pattern
  const patternMatch = parsed.frontmatter.match(/^pua_failure_pattern:\s*"?([^"\n]*)"?\s*$/m);
  if (patternMatch) {
    const value = patternMatch[1].trim();
    if (value) {
      result.puaFailurePattern = value;
    }
  }

  return result;
}

/**
 * Write PUA-related fields into StatusFile content.
 *
 * If the content has valid YAML frontmatter, updates or adds the PUA fields.
 * If the content has no frontmatter, creates new frontmatter with the fields.
 * Preserves all other fields in the frontmatter. Only writes fields that
 * are not `undefined`.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 10.5, 10.6, 10.7**
 *
 * @param statusContent - Raw StatusFile content string.
 * @param fields - PUA status fields to write.
 * @returns Updated StatusFile content string.
 */
export function writePuaFields(statusContent: string, fields: PuaStatusFields): string {
  const parsed = parseFrontmatter(statusContent);

  if (!parsed) {
    // No frontmatter — create one with the PUA fields
    const newLines: string[] = [];
    if (fields.puaPressureLevel !== undefined) {
      newLines.push(`pua_pressure_level: "${fields.puaPressureLevel}"`);
    }
    if (fields.puaMethodology !== undefined) {
      newLines.push(`pua_methodology: "${fields.puaMethodology}"`);
    }
    if (fields.puaChainIndex !== undefined) {
      newLines.push(`pua_chain_index: ${fields.puaChainIndex}`);
    }
    if (fields.puaFailurePattern !== undefined) {
      newLines.push(`pua_failure_pattern: "${fields.puaFailurePattern}"`);
    }

    if (newLines.length === 0) {
      return statusContent;
    }

    const trimmed = statusContent.trimStart();
    const fm = newLines.join("\n");
    return `${FRONTMATTER_DELIMITER}\n${fm}\n${FRONTMATTER_DELIMITER}\n${trimmed}`;
  }

  const lines = getFrontmatterLines(parsed.frontmatter);

  if (fields.puaPressureLevel !== undefined) {
    setField(lines, /^pua_pressure_level:\s/, `pua_pressure_level: "${fields.puaPressureLevel}"`);
  }
  if (fields.puaMethodology !== undefined) {
    setField(lines, /^pua_methodology:\s/, `pua_methodology: "${fields.puaMethodology}"`);
  }
  if (fields.puaChainIndex !== undefined) {
    setField(lines, /^pua_chain_index:\s/, `pua_chain_index: ${fields.puaChainIndex}`);
  }
  if (fields.puaFailurePattern !== undefined) {
    setField(
      lines,
      /^pua_failure_pattern:\s/,
      `pua_failure_pattern: "${fields.puaFailurePattern}"`,
    );
  }

  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}

/**
 * Remove all PUA-related fields from StatusFile content.
 *
 * Uses regex matching `^pua_` prefix to remove all PUA fields from the
 * YAML frontmatter. Preserves all non-PUA fields unchanged.
 * If no frontmatter exists, returns content unchanged.
 *
 * **Validates: Requirements 9.5, 9.6, 10.5, 10.6, 10.7**
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns Updated StatusFile content string with PUA fields removed.
 */
export function clearPuaFields(statusContent: string): string {
  const parsed = parseFrontmatter(statusContent);

  if (!parsed) {
    return statusContent;
  }

  const lines = getFrontmatterLines(parsed.frontmatter);
  const filtered = lines.filter((line) => !PUA_FIELD_PATTERN.test(line));

  return buildContent(filtered, parsed.body, parsed.leadingWhitespace);
}

// ---------------------------------------------------------------------------
// Package status fields
// ---------------------------------------------------------------------------

/** Extract package-related fields from StatusFile content. */
export function extractPackageFields(statusContent: string): PackageStatusFields {
  const result: PackageStatusFields = {};
  const parsed = parseFrontmatter(statusContent);
  if (!parsed) return result;

  const currentMatch = parsed.frontmatter.match(/^current_package:\s*"?([^"\n]*)"?\s*$/m);
  if (currentMatch?.[1]?.trim()) result.currentPackage = currentMatch[1].trim();

  const completedMatch = parsed.frontmatter.match(/^completed_packages:\s*"?([^"\n]*)"?\s*$/m);
  if (completedMatch?.[1]?.trim()) {
    result.completedPackages = completedMatch[1]
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  const nextMatch = parsed.frontmatter.match(/^next_package:\s*"?([^"\n]*)"?\s*$/m);
  if (nextMatch?.[1]?.trim()) result.nextPackage = nextMatch[1].trim();

  const countMatch = parsed.frontmatter.match(/^package_count:\s*(\d+)\s*$/m);
  if (countMatch) result.packageCount = Number.parseInt(countMatch[1], 10);

  return result;
}

/** Write package-related fields into StatusFile content. */
export function writePackageFields(statusContent: string, fields: PackageStatusFields): string {
  const parsed = parseFrontmatter(statusContent);
  const lines = parsed ? getFrontmatterLines(parsed.frontmatter) : [];
  const body = parsed ? parsed.body : statusContent.trimStart();
  const leadingWhitespace = parsed ? parsed.leadingWhitespace : "";

  if (fields.currentPackage !== undefined) {
    setField(lines, /^current_package:\s/, `current_package: "${fields.currentPackage}"`);
  }
  if (fields.completedPackages !== undefined) {
    setField(
      lines,
      /^completed_packages:\s/,
      `completed_packages: "${fields.completedPackages.join(",")}"`,
    );
  }
  if (fields.nextPackage !== undefined) {
    setField(lines, /^next_package:\s/, `next_package: "${fields.nextPackage}"`);
  }
  if (fields.packageCount !== undefined) {
    setField(lines, /^package_count:\s/, `package_count: ${fields.packageCount}`);
  }

  return buildContent(lines, body, leadingWhitespace);
}

/** Remove package-related fields while preserving other StatusFile fields. */
export function clearPackageFields(statusContent: string): string {
  const parsed = parseFrontmatter(statusContent);
  if (!parsed) return statusContent;
  const lines = getFrontmatterLines(parsed.frontmatter).filter(
    (line) => !PACKAGE_FIELD_PATTERNS.some((pattern) => pattern.test(line)),
  );
  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}
