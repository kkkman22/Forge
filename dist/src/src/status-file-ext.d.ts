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
export declare function extractLoopFields(statusContent: string): LoopStatusFields;
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
export declare function writeLoopFields(statusContent: string, fields: LoopStatusFields): string;
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
export declare function clearLoopFields(statusContent: string): string;
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
export declare function updateIterationStatus(statusContent: string, phase: string, iteration: number): string;
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
export declare function extractPuaFields(statusContent: string): PuaStatusFields;
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
export declare function writePuaFields(statusContent: string, fields: PuaStatusFields): string;
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
export declare function clearPuaFields(statusContent: string): string;
