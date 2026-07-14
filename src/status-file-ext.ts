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
// P2-4: delegate frontmatter parsing to the authoritative module + adapter
// (was a private character-identical clone of frontmatter.ts).
import { parseFrontmatterPreservingLeading } from "./frontmatter.js";

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

/** Diagnostic execution metadata persisted in StatusFile frontmatter. */
export interface ExecutionMetadata {
  claude_version?: string;
  dispatch_mode?: "inline" | "agents" | "auto";
  diagnostic_mode?: boolean;
  tier?: "light" | "standard" | "full";
  branch?: string;
  forge_flags?: string[];
  recorded_at?: string;
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

const EXECUTION_METADATA_FIELD_PATTERNS: readonly RegExp[] = [
  /^execution_claude_version:\s/,
  /^execution_dispatch_mode:\s/,
  /^execution_diagnostic_mode:\s/,
  /^execution_tier:\s/,
  /^execution_branch:\s/,
  /^execution_forge_flags:\s/,
  /^execution_recorded_at:\s/,
];

/** Valid execution mode values. */
const VALID_MODES: ReadonlySet<string> = new Set(["interactive", "autonomous"]);

const VALID_DISPATCH_MODES: ReadonlySet<string> = new Set(["inline", "agents", "auto"]);
const VALID_TIERS: ReadonlySet<string> = new Set(["light", "standard", "full"]);
const ALLOWED_FORGE_FLAGS: ReadonlySet<string> = new Set([
  "FORGE_DIAGNOSTIC_MODE",
  "FORGE_REVIEW_CONCURRENCY",
  "FORGE_REVIEW_DISPATCH_MODE",
  "FORGE_DECIDE_DISPATCH_MODE",
  "FORGE_ROOT",
]);
const SECRET_KEY_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|AUTH)/i;

/** Regex matching any PUA field line (pua_ prefix). */
const PUA_FIELD_PATTERN = /^pua_\w+:\s/;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from StatusFile content.
 * Returns the frontmatter block (without delimiters) and the body after it.
 * Returns null if no valid frontmatter is found.
 *
 * P2-4: delegates to the authoritative `parseFrontmatterPreservingLeading` in
 * frontmatter.ts (was a private clone).
 */
function parseFrontmatter(content: string): {
  frontmatter: string;
  body: string;
  leadingWhitespace: string;
} | null {
  return parseFrontmatterPreservingLeading(content);
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

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseQuotedString(frontmatter: string, field: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*"?([^"\\n]*)"?\\s*$`, "m"));
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function sanitizeForgeFlags(flags: string[] | undefined): string[] | undefined {
  if (!flags) return undefined;
  const result = flags
    .filter((flag) => ALLOWED_FORGE_FLAGS.has(flag))
    .filter((flag) => !SECRET_KEY_PATTERN.test(flag));
  return result.length > 0 ? Array.from(new Set(result)) : undefined;
}

function sanitizeExecutionMetadata(metadata: ExecutionMetadata): ExecutionMetadata {
  const result: ExecutionMetadata = {};
  if (metadata.claude_version) result.claude_version = metadata.claude_version;
  if (metadata.dispatch_mode && VALID_DISPATCH_MODES.has(metadata.dispatch_mode)) {
    result.dispatch_mode = metadata.dispatch_mode;
  }
  if (metadata.diagnostic_mode !== undefined) result.diagnostic_mode = metadata.diagnostic_mode;
  if (metadata.tier && VALID_TIERS.has(metadata.tier)) result.tier = metadata.tier;
  if (metadata.branch) result.branch = metadata.branch;
  const forgeFlags = sanitizeForgeFlags(metadata.forge_flags);
  if (forgeFlags) result.forge_flags = forgeFlags;
  if (metadata.recorded_at) result.recorded_at = metadata.recorded_at;
  return result;
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

// ---------------------------------------------------------------------------
// Execution metadata fields
// ---------------------------------------------------------------------------

export function extractExecutionMetadata(statusContent: string): ExecutionMetadata {
  const result: ExecutionMetadata = {};
  const parsed = parseFrontmatter(statusContent);
  if (!parsed) return result;

  const claudeVersion = parseQuotedString(parsed.frontmatter, "execution_claude_version");
  if (claudeVersion) result.claude_version = claudeVersion;

  const dispatchMode = parseQuotedString(parsed.frontmatter, "execution_dispatch_mode");
  if (dispatchMode && VALID_DISPATCH_MODES.has(dispatchMode)) {
    result.dispatch_mode = dispatchMode as ExecutionMetadata["dispatch_mode"];
  }

  const diagnosticMode = parseQuotedString(parsed.frontmatter, "execution_diagnostic_mode");
  if (diagnosticMode === "true") result.diagnostic_mode = true;
  if (diagnosticMode === "false") result.diagnostic_mode = false;

  const tier = parseQuotedString(parsed.frontmatter, "execution_tier");
  if (tier && VALID_TIERS.has(tier)) {
    result.tier = tier as ExecutionMetadata["tier"];
  }

  const branch = parseQuotedString(parsed.frontmatter, "execution_branch");
  if (branch) result.branch = branch;

  const flags = parseQuotedString(parsed.frontmatter, "execution_forge_flags");
  if (flags) {
    result.forge_flags = flags
      .split(",")
      .map((flag) => flag.trim())
      .filter((flag) => ALLOWED_FORGE_FLAGS.has(flag))
      .filter((flag) => !SECRET_KEY_PATTERN.test(flag));
  }

  const recordedAt = parseQuotedString(parsed.frontmatter, "execution_recorded_at");
  if (recordedAt) result.recorded_at = recordedAt;

  return result;
}

export function writeExecutionMetadata(statusContent: string, metadata: ExecutionMetadata): string {
  const sanitized = sanitizeExecutionMetadata(metadata);
  const parsed = parseFrontmatter(statusContent);
  const lines = parsed ? getFrontmatterLines(parsed.frontmatter) : [];
  const body = parsed ? parsed.body : statusContent.trimStart();
  const leadingWhitespace = parsed ? parsed.leadingWhitespace : "";

  if (sanitized.claude_version !== undefined) {
    setField(
      lines,
      /^execution_claude_version:\s/,
      `execution_claude_version: ${quoteYaml(sanitized.claude_version)}`,
    );
  }
  if (sanitized.dispatch_mode !== undefined) {
    setField(
      lines,
      /^execution_dispatch_mode:\s/,
      `execution_dispatch_mode: ${quoteYaml(sanitized.dispatch_mode)}`,
    );
  }
  if (sanitized.diagnostic_mode !== undefined) {
    setField(
      lines,
      /^execution_diagnostic_mode:\s/,
      `execution_diagnostic_mode: ${sanitized.diagnostic_mode ? "true" : "false"}`,
    );
  }
  if (sanitized.tier !== undefined) {
    setField(lines, /^execution_tier:\s/, `execution_tier: ${quoteYaml(sanitized.tier)}`);
  }
  if (sanitized.branch !== undefined) {
    setField(lines, /^execution_branch:\s/, `execution_branch: ${quoteYaml(sanitized.branch)}`);
  }
  if (sanitized.forge_flags !== undefined) {
    setField(
      lines,
      /^execution_forge_flags:\s/,
      `execution_forge_flags: ${quoteYaml(sanitized.forge_flags.join(","))}`,
    );
  }
  if (sanitized.recorded_at !== undefined) {
    setField(
      lines,
      /^execution_recorded_at:\s/,
      `execution_recorded_at: ${quoteYaml(sanitized.recorded_at)}`,
    );
  }

  return buildContent(lines, body, leadingWhitespace);
}

export function clearExecutionMetadata(statusContent: string): string {
  const parsed = parseFrontmatter(statusContent);
  if (!parsed) return statusContent;
  const lines = getFrontmatterLines(parsed.frontmatter).filter(
    (line) => !EXECUTION_METADATA_FIELD_PATTERNS.some((pattern) => pattern.test(line)),
  );
  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}

export function collectExecutionMetadataFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ExecutionMetadata {
  const forge_flags = sanitizeForgeFlags(Object.keys(env));
  const metadata: ExecutionMetadata = {
    diagnostic_mode: env.FORGE_DIAGNOSTIC_MODE === "1",
  };
  if (forge_flags) metadata.forge_flags = forge_flags;
  return metadata;
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
