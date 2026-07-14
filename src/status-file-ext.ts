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
// P2-4: delegate frontmatter parsing to the authoritative module + adapter
// (was a private character-identical clone of frontmatter.ts).
import { parseFrontmatterPreservingLeading } from "./frontmatter.js";
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
// Generic field codec (P2-4) — one engine drives extract/write/clear for all 4
// families. Each family declares a FieldSpec table describing yamlKey + kind +
// optional validator. The 12 family-specific functions become table lookups.
// ---------------------------------------------------------------------------

/** Encoding kinds supported by the generic codec. */
type FieldKind = "string" | "number" | "boolean" | "csv";

/** Descriptor for one field in a family codec table. */
interface FieldSpec<TFields, K extends keyof TFields> {
  /** Property name in the typed result object. */
  key: K;
  /** YAML frontmatter key. */
  yamlKey: string;
  /** Encoding/decoding kind. */
  kind: FieldKind;
  /** Optional validator: return false to reject a parsed value. */
  accept?: (raw: string) => boolean;
}

/** Extract the raw string for a yaml key (quoted or unquoted), or undefined. */
function extractRaw(frontmatter: string, yamlKey: string): string | undefined {
  const escaped = yamlKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = frontmatter.match(new RegExp(`^${escaped}:\\s*"?([^"\\n]*)"?\\s*$`, "m"));
  const v = m?.[1]?.trim();
  return v ? v : undefined;
}

/** Encode a value to its YAML line form per kind. */
function encodeField(yamlKey: string, kind: FieldKind, value: unknown): string {
  switch (kind) {
    case "number":
      return `${yamlKey}: ${value as number}`;
    case "boolean":
      return `${yamlKey}: ${value ? "true" : "false"}`;
    case "csv":
      return `${yamlKey}: "${(value as string[]).join(",")}"`;
    default:
      return `${yamlKey}: "${value as string}"`;
  }
}

/** Decode a raw string to the kind's typed value, applying accept() if given. */
function decodeField(
  frontmatter: string,
  spec: FieldSpec<Record<string, unknown>, string>,
): unknown {
  const raw = extractRaw(frontmatter, spec.yamlKey);
  if (raw === undefined) return undefined;
  switch (spec.kind) {
    case "number": {
      if (!/^\d+$/.test(raw)) return undefined;
      return Number.parseInt(raw, 10);
    }
    case "boolean":
      if (raw === "true") return true;
      if (raw === "false") return false;
      return undefined;
    case "csv":
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    default:
      if (spec.accept && !spec.accept(raw)) return undefined;
      return raw;
  }
}

/**
 * Generic extract: read all fields described by the spec table from
 * frontmatter into a typed result object.
 */
function extractFields<TFields>(
  statusContent: string,
  specs: ReadonlyArray<FieldSpec<TFields, keyof TFields>>,
): TFields {
  const result = {} as TFields;
  const parsed = parseFrontmatter(statusContent);
  if (!parsed) return result;
  for (const spec of specs) {
    const decoded = decodeField(
      parsed.frontmatter,
      spec as FieldSpec<Record<string, unknown>, string>,
    );
    if (decoded !== undefined) {
      // For csv, also reject empty arrays to match prior behavior (only set if non-empty).
      if (spec.kind === "csv" && Array.isArray(decoded) && decoded.length === 0) continue;
      (result as Record<string, unknown>)[spec.key as string] = decoded;
    }
  }
  return result;
}

/**
 * Generic write: encode all defined fields from the values object into the
 * frontmatter (creating frontmatter if absent). Preserves unrelated fields.
 */
function writeFields<TFields>(
  statusContent: string,
  values: TFields,
  specs: ReadonlyArray<FieldSpec<TFields, keyof TFields>>,
): string {
  const parsed = parseFrontmatter(statusContent);
  const escapedKey = (k: string): RegExp =>
    new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s`);
  const valuesMap = values as unknown as Record<string, unknown>;

  if (!parsed) {
    const newLines: string[] = [];
    for (const spec of specs) {
      const v = valuesMap[spec.key as string];
      if (v !== undefined) newLines.push(encodeField(spec.yamlKey, spec.kind, v));
    }
    if (newLines.length === 0) return statusContent;
    const trimmed = statusContent.trimStart();
    return `${FRONTMATTER_DELIMITER}\n${newLines.join("\n")}\n${FRONTMATTER_DELIMITER}\n${trimmed}`;
  }

  const lines = getFrontmatterLines(parsed.frontmatter);
  for (const spec of specs) {
    const v = valuesMap[spec.key as string];
    if (v !== undefined)
      setField(lines, escapedKey(spec.yamlKey), encodeField(spec.yamlKey, spec.kind, v));
  }
  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}

/**
 * Generic clear: remove all lines matching any of the spec's yamlKeys.
 */
function clearFields<TFields>(
  statusContent: string,
  specs: ReadonlyArray<FieldSpec<TFields, keyof TFields>>,
): string {
  const parsed = parseFrontmatter(statusContent);
  if (!parsed) return statusContent;
  const patterns = specs.map(
    (s) => new RegExp(`^${s.yamlKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s`),
  );
  const lines = getFrontmatterLines(parsed.frontmatter).filter(
    (line) => !patterns.some((p) => p.test(line)),
  );
  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}

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
// Codec tables (P2-4) — declarative field specs per family
// ---------------------------------------------------------------------------

const LOOP_CODEC: ReadonlyArray<FieldSpec<LoopStatusFields, keyof LoopStatusFields>> = [
  { key: "mode", yamlKey: "mode", kind: "string", accept: (v) => VALID_MODES.has(v) },
  { key: "loopRunId", yamlKey: "loop_run_id", kind: "string" },
  { key: "loopIteration", yamlKey: "loop_iteration", kind: "number" },
  { key: "skillSequence", yamlKey: "skill_sequence", kind: "csv" },
  { key: "workNature", yamlKey: "work_nature", kind: "string" },
];

const PUA_CODEC: ReadonlyArray<FieldSpec<PuaStatusFields, keyof PuaStatusFields>> = [
  {
    key: "puaPressureLevel",
    yamlKey: "pua_pressure_level",
    kind: "string",
    accept: (v) => VALID_PRESSURE_LEVELS.has(v),
  },
  { key: "puaMethodology", yamlKey: "pua_methodology", kind: "string" },
  { key: "puaChainIndex", yamlKey: "pua_chain_index", kind: "number" },
  { key: "puaFailurePattern", yamlKey: "pua_failure_pattern", kind: "string" },
];

const PACKAGE_CODEC: ReadonlyArray<FieldSpec<PackageStatusFields, keyof PackageStatusFields>> = [
  { key: "currentPackage", yamlKey: "current_package", kind: "string" },
  { key: "completedPackages", yamlKey: "completed_packages", kind: "csv" },
  { key: "nextPackage", yamlKey: "next_package", kind: "string" },
  { key: "packageCount", yamlKey: "package_count", kind: "number" },
];

// ExecutionMetadata has bespoke sanitize/validation on write, so only clear is
// table-driven; extract/write keep their specialized logic.
const EXECUTION_CODEC_KEYS: ReadonlyArray<FieldSpec<ExecutionMetadata, keyof ExecutionMetadata>> = [
  { key: "claude_version", yamlKey: "execution_claude_version", kind: "string" },
  { key: "dispatch_mode", yamlKey: "execution_dispatch_mode", kind: "string" },
  { key: "diagnostic_mode", yamlKey: "execution_diagnostic_mode", kind: "boolean" },
  { key: "tier", yamlKey: "execution_tier", kind: "string" },
  { key: "branch", yamlKey: "execution_branch", kind: "string" },
  { key: "forge_flags", yamlKey: "execution_forge_flags", kind: "csv" },
  { key: "recorded_at", yamlKey: "execution_recorded_at", kind: "string" },
];

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
  return extractFields(statusContent, LOOP_CODEC);
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
  return writeFields(statusContent, fields, LOOP_CODEC);
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
  return clearFields(statusContent, LOOP_CODEC);
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
  return clearFields(statusContent, EXECUTION_CODEC_KEYS);
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
  return extractFields(statusContent, PUA_CODEC);
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
  return writeFields(statusContent, fields, PUA_CODEC);
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
  // Keep the broad /^pua_\w+:/ clear (not the 4-key codec table) so unknown
  // pua_* fields are also removed — prior behavior.
  const parsed = parseFrontmatter(statusContent);
  if (!parsed) return statusContent;
  const lines = getFrontmatterLines(parsed.frontmatter).filter(
    (line) => !PUA_FIELD_PATTERN.test(line),
  );
  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}

// ---------------------------------------------------------------------------
// Package status fields
// ---------------------------------------------------------------------------

/** Extract package-related fields from StatusFile content. */
export function extractPackageFields(statusContent: string): PackageStatusFields {
  return extractFields(statusContent, PACKAGE_CODEC);
}

/** Write package-related fields into StatusFile content. */
export function writePackageFields(statusContent: string, fields: PackageStatusFields): string {
  return writeFields(statusContent, fields, PACKAGE_CODEC);
}

/** Remove package-related fields while preserving other StatusFile fields. */
export function clearPackageFields(statusContent: string): string {
  return clearFields(statusContent, PACKAGE_CODEC);
}
