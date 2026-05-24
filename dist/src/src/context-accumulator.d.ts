/**
 * Cross-iteration cumulative context — notes.md formatting, parsing,
 * and iteration prompt construction.
 *
 * All functions are pure: they accept data and return strings or parsed
 * structures without side effects. The SKILL layer is responsible for
 * actual file I/O.
 *
 * Design reference: gnhf-inspired-enhancements § context-accumulator.ts
 * **Validates: Requirements 3.1–3.7, 1.2, 2.1–2.6**
 */
import type { IterationEntry, NotesDocument } from "./loop-types.js";
import type { PuaContext } from "./pua-engine.js";
/**
 * Format a bullet list section with a bold title.
 *
 * Returns an empty string when `items` is empty so that round-trip
 * parsing can distinguish "no items" from "empty section header".
 */
export declare function formatListSection(title: string, items: string[]): string;
/**
 * Format a single {@link IterationEntry} as a Markdown snippet.
 *
 * Successful entries include:
 * ```
 * ### Iteration N
 *
 * **Summary:** <text>
 *
 * **Key Changes:**
 * - change 1
 * - change 2
 *
 * **Key Learnings:**
 * - learning 1
 * ```
 *
 * Failed entries include a `(Failed)` marker in the heading and omit
 * the key changes section (failed iterations have no committed changes).
 *
 * @param entry  The iteration record to format.
 * @returns Markdown string for this entry.
 */
export declare function formatIterationEntry(entry: IterationEntry): string;
/**
 * Serialize a {@link NotesDocument} to Markdown.
 *
 * The output follows this structure:
 * ```
 * # Run: <runId>
 *
 * ## Iteration Log
 *
 * ### Iteration 1
 * ...
 *
 * ### Iteration 2
 * ...
 * ```
 *
 * @param doc  The notes document to serialize.
 * @returns Complete Markdown string.
 */
export declare function formatNotesDocument(doc: NotesDocument): string;
/**
 * Parse a Markdown string back into a {@link NotesDocument}.
 *
 * This is the inverse of {@link formatNotesDocument}. The parser is
 * tolerant of minor whitespace variations but expects the structural
 * markers produced by the formatter.
 *
 * Round-trip guarantee: `parseNotesDocument(formatNotesDocument(doc))`
 * produces a semantically equivalent `NotesDocument`.
 *
 * @param markdown  The Markdown content to parse.
 * @returns Parsed notes document.
 */
export declare function parseNotesDocument(markdown: string): NotesDocument;
/**
 * Parse a bullet list section from a Markdown block.
 *
 * Looks for a pattern like:
 * ```
 * **Title:**
 * - item 1
 * - item 2
 * ```
 *
 * @param block  The Markdown block to search within.
 * @param title  The section title (e.g. "Key Changes").
 * @returns Array of list items, or empty array if section not found.
 */
export declare function parseListSection(block: string, title: string): string[];
/**
 * Append a formatted iteration entry to existing Markdown content.
 *
 * Ensures proper spacing between the existing content and the new entry.
 *
 * @param existingMarkdown  Current notes.md content.
 * @param entry             The iteration entry to append.
 * @returns Updated Markdown string with the new entry appended.
 */
export declare function appendEntry(existingMarkdown: string, entry: IterationEntry): string;
/** Minimum number of recent entries kept in full detail during compaction. */
export declare const MIN_FULL_DETAIL_ENTRIES = 3;
/**
 * Compact notes markdown when it exceeds a character budget.
 *
 * Keeps the most recent {@link MIN_FULL_DETAIL_ENTRIES} entries in full detail
 * and replaces older entries with a single-line summary:
 * ```
 * ### Iteration N (compacted): <summary>
 * ```
 *
 * When `markdown` is within budget it is returned unchanged.
 *
 * @param markdown   The full notes.md content.
 * @param charBudget Maximum characters for the compacted output.
 * @returns Compacted markdown string.
 */
export declare function compactNotesContent(markdown: string, charBudget?: number): string;
/**
 * Construct the iteration prompt injected into the agent for each iteration.
 *
 * The prompt includes:
 * - Iteration number and run ID
 * - Instructions to read notes.md and work incrementally
 * - Structured output field descriptions
 * - Optional stop condition section
 * - The original objective
 * - Full notes.md content for context
 *
 * @param params  Prompt construction parameters.
 * @returns Complete prompt string for the agent.
 */
export declare function buildIterationPrompt(params: {
    iteration: number;
    runId: string;
    objective: string;
    notesContent: string;
    stopWhen?: string;
}): string;
/**
 * Parameters for building a Skill-aware iteration prompt.
 *
 * Combines the standard iteration prompt parameters with SKILL context
 * (phase, tier, hints, fix issues) to guide the agent toward the correct
 * SKILL invocation during autonomous loop execution.
 */
export interface SkillPromptParams {
    /** Standard iteration prompt parameters (passed to buildIterationPrompt). */
    base: {
        iteration: number;
        runId: string;
        objective: string;
        notesContent: string;
        stopWhen?: string;
    };
    /** SKILL context injected after the base prompt. */
    skill: {
        /** Current SKILL phase (e.g. "build", "review"). Empty/missing triggers routing. */
        phase: string;
        /** Routing tier (e.g. "light", "standard", "full"). */
        tier: string;
        /** Task domain type (e.g. "frontend", "backend"). */
        taskType?: string;
        /** Project lifecycle phase (e.g. "greenfield", "bugfix"). */
        projectPhase?: string;
        /** Work nature (e.g. "feature", "refactor", "bugfix"). */
        workNature?: string;
        /** Behavioral hints from the router for downstream skills. */
        hints?: Array<{
            command: string;
            tag: string;
            description: string;
        }>;
        /** P0/P1 issues from a previous review that need fixing. */
        fixIssues?: Array<{
            severity: string;
            description: string;
        }>;
    };
    /**
     * PUA Quality Engine context (optional).
     *
     * When provided, a PUA pressure prompt section is injected after the
     * SKILL Context section and before the Execution Mode section.
     * When `pressureLevel` is L3 or L4, the Proactive Initiative Checklist
     * is additionally injected.
     *
     * When undefined, the output is identical to the pre-PUA behavior
     * (backward compatible).
     */
    puaContext?: PuaContext;
}
/**
 * Build a Skill-aware iteration prompt.
 *
 * Constructs the standard iteration prompt via {@link buildIterationPrompt},
 * then appends a `## SKILL Context` section containing the current phase,
 * tier, optional task type / project phase, behavioral hints, and fix issues.
 *
 * When `phase` is empty or missing, the prompt instructs the agent to run
 * routing analysis first (call forge-router). The output always includes a
 * `mode: autonomous` directive so the agent skips all confirmation points.
 *
 * @param params  Skill-aware prompt construction parameters.
 * @returns Complete prompt string for the agent.
 */
export declare function buildSkillAwarePrompt(params: SkillPromptParams): string;
