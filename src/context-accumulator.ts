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
import { PROACTIVE_INITIATIVE_CHECKLIST } from "./pua-engine.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format a bullet list section with a bold title.
 *
 * Returns an empty string when `items` is empty so that round-trip
 * parsing can distinguish "no items" from "empty section header".
 */
export function formatListSection(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `**${title}:**\n${items.map((item) => `- ${item}`).join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Entry formatting
// ---------------------------------------------------------------------------

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
export function formatIterationEntry(entry: IterationEntry): string {
  const header = entry.success
    ? `### Iteration ${entry.number}`
    : `### Iteration ${entry.number} (Failed)`;

  const parts: string[] = [`${header}\n`, `**Summary:** ${entry.summary}\n`];

  if (entry.success) {
    const changesSection = formatListSection("Key Changes", entry.keyChanges);
    if (changesSection) {
      parts.push(changesSection);
    }
  }

  const learningsSection = formatListSection("Key Learnings", entry.keyLearnings);
  if (learningsSection) {
    parts.push(learningsSection);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Document formatting
// ---------------------------------------------------------------------------

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
export function formatNotesDocument(doc: NotesDocument): string {
  const branchLine = doc.branchName !== undefined ? `\nBranch: ${doc.branchName}` : "";
  const header = `# Run: ${doc.runId}${branchLine}\n\n## Iteration Log\n`;

  if (doc.entries.length === 0) {
    return `${header}\n`;
  }

  const entriesMarkdown = doc.entries.map((e) => formatIterationEntry(e)).join("\n");

  return `${header}\n${entriesMarkdown}\n`;
}

// ---------------------------------------------------------------------------
// Document parsing
// ---------------------------------------------------------------------------

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
export function parseNotesDocument(markdown: string): NotesDocument {
  // Extract runId from the header line: "# Run: <runId>"
  const headerMatch = markdown.match(/^# Run:\s*(.+)$/m);
  const runId = headerMatch ? headerMatch[1].trim() : "";

  // Extract optional branchName from "Branch: <branchName>" line
  const branchMatch = markdown.match(/^Branch:\s*(.+)$/m);
  const branchName = branchMatch ? branchMatch[1].trim() : undefined;

  // Split on iteration headers: "### Iteration N" or "### Iteration N (Failed)"
  const iterationPattern = /^### Iteration (\d+)(?:\s*\(Failed\))?$/gm;
  const entries: IterationEntry[] = [];

  const matches: { index: number; number: number; failed: boolean }[] = [];
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((match = iterationPattern.exec(markdown)) !== null) {
    const isFailed = match[0].includes("(Failed)");
    matches.push({
      index: match.index,
      number: Number.parseInt(match[1], 10),
      failed: isFailed,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const start = current.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    const block = markdown.slice(start, end);

    // Extract summary
    const summaryMatch = block.match(/\*\*Summary:\*\*\s*(.+)$/m);
    const summary = summaryMatch ? summaryMatch[1].trim() : "";

    // Extract key changes
    const keyChanges = parseListSection(block, "Key Changes");

    // Extract key learnings
    const keyLearnings = parseListSection(block, "Key Learnings");

    entries.push({
      number: current.number,
      success: !current.failed,
      summary,
      keyChanges,
      keyLearnings,
    });
  }

  return branchName !== undefined ? { runId, branchName, entries } : { runId, entries };
}

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
export function parseListSection(block: string, title: string): string[] {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\*\\*${escapedTitle}:\\*\\*\\n((?:- .+\\n?)*)`, "m");
  const match = block.match(pattern);
  if (!match?.[1]) return [];

  return match[1]
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

// ---------------------------------------------------------------------------
// Append entry
// ---------------------------------------------------------------------------

/**
 * Append a formatted iteration entry to existing Markdown content.
 *
 * Ensures proper spacing between the existing content and the new entry.
 *
 * @param existingMarkdown  Current notes.md content.
 * @param entry             The iteration entry to append.
 * @returns Updated Markdown string with the new entry appended.
 */
export function appendEntry(existingMarkdown: string, entry: IterationEntry): string {
  const formatted = formatIterationEntry(entry);
  const trimmed = existingMarkdown.trimEnd();
  return `${trimmed}\n\n${formatted}\n`;
}

// ---------------------------------------------------------------------------
// Notes compaction
// ---------------------------------------------------------------------------

/** Default character budget for compacted notes (~2000 tokens at 4 chars/token). */
const DEFAULT_NOTES_CHAR_BUDGET = 8000;

/** Minimum number of recent entries kept in full detail during compaction. */
const MIN_FULL_DETAIL_ENTRIES = 3;

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
export function compactNotesContent(
  markdown: string,
  charBudget: number = DEFAULT_NOTES_CHAR_BUDGET,
): string {
  if (markdown.length <= charBudget) return markdown;

  // Parse into a NotesDocument so we can selectively compact entries.
  const doc = parseNotesDocument(markdown);
  const entries = doc.entries;

  if (entries.length <= MIN_FULL_DETAIL_ENTRIES) return markdown;

  const splitIndex = Math.max(0, entries.length - MIN_FULL_DETAIL_ENTRIES);
  const compacted = entries.slice(0, splitIndex);
  const kept = entries.slice(splitIndex);

  // Build compacted header lines.
  const compactedLines = compacted.map(
    (e) => `### Iteration ${e.number} (compacted): ${e.summary}`,
  );

  // Rebuild the document with compacted old entries + full recent entries.
  const branchLine = doc.branchName !== undefined ? `\nBranch: ${doc.branchName}` : "";
  const header = `# Run: ${doc.runId}${branchLine}\n\n## Iteration Log\n`;

  const body = [...compactedLines, "", ...kept.map((e) => formatIterationEntry(e))].join("\n");

  const result = `${header}\n${body}\n`;

  // If compaction didn't bring us under budget, return anyway — partial help
  // is better than none. The retry with a shorter prompt is still valuable.
  return result;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

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
export function buildIterationPrompt(params: {
  iteration: number;
  runId: string;
  objective: string;
  notesContent: string;
  stopWhen?: string;
}): string {
  const outputFields = [
    "- success: whether you were able to make a meaningful contribution that got us closer towards the objective. setting this to false means any code change you made should be discarded",
    "- summary: a concise one-sentence summary of the accomplishment in this iteration",
    "- key_changes_made: an array of descriptions for key changes you made. don't group this by file - group by logical units of work. don't describe activities - describe material outcomes",
    "- key_learnings: an array of new learnings that were surprising, weren't captured by previous notes and would be informative for future iterations",
  ];

  if (params.stopWhen !== undefined) {
    outputFields.push(
      "- should_fully_stop: set to true ONLY when the stop condition below is fully met and the entire loop should end. default to false",
    );
  }

  const stopConditionSection =
    params.stopWhen !== undefined
      ? `\n\n## Stop Condition\n\nThe user has configured a condition to end the loop: ${params.stopWhen}\nIf this condition is fully met after this iteration's work, set should_fully_stop=true in your output. Otherwise set it to false.`
      : "";

  return `You are working autonomously towards an objective given below.
This is iteration ${params.iteration}. Each iteration aims to make an incremental step forward, not to complete the entire objective.

Run ID: ${params.runId}

## Instructions

1. Read the notes content below to understand what has been done in previous iterations. Do NOT write to or modify notes.md - it is maintained automatically by the orchestrator
2. Identify the next smallest logical unit of work that's individually verifiable and would make incremental progress towards the objective, and treat that as the scope of this iteration
3. If you attempted a solution and it didn't end up moving the needle on the objective, document learnings and record success=false, then conclude the iteration rather than continuously pivoting
4. If you made code changes, run build/tests/linters/formatters if available to validate your work. Do NOT make any git commits - that will be handled automatically by the orchestrator
5. If you started any long-running background processes (dev servers, browsers, watchers, Electron, etc.), stop them before finishing the iteration
6. Only submit the final JSON object after the result is final: your work is complete, validation is done, and you have stopped any background processes you started
7. Be mindful of context window usage. Use targeted grep/search to locate relevant code before reading entire files. Avoid reading files larger than 200 lines unless necessary

## Output

${outputFields.join("\n")}${stopConditionSection}

## Objective

${params.objective}

## Notes

${params.notesContent}`;
}

// ---------------------------------------------------------------------------
// Skill-aware prompt construction
// ---------------------------------------------------------------------------

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
    hints?: Array<{ command: string; tag: string; description: string }>;
    /** P0/P1 issues from a previous review that need fixing. */
    fixIssues?: Array<{ severity: string; description: string }>;
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
export function buildSkillAwarePrompt(params: SkillPromptParams): string {
  const basePrompt = buildIterationPrompt(params.base);

  const sections: string[] = [];

  sections.push("## SKILL Context");
  sections.push("");

  // Phase and tier
  const hasPhase = params.skill.phase !== undefined && params.skill.phase.trim() !== "";

  if (hasPhase) {
    sections.push(`Current phase: ${params.skill.phase}`);
    sections.push(`Tier: ${params.skill.tier}`);
    sections.push("");
    sections.push(`Execute the **forge-${params.skill.phase}** SKILL for this iteration.`);
  } else {
    sections.push(`Tier: ${params.skill.tier}`);
    sections.push("");
    sections.push(
      "No phase is set. Execute routing analysis first by calling **forge-router** to determine the current phase and command sequence.",
    );
  }

  // Task type (optional)
  if (params.skill.taskType) {
    sections.push(`Task type: ${params.skill.taskType}`);
  }

  // Project phase (optional)
  if (params.skill.projectPhase) {
    sections.push(`Project phase: ${params.skill.projectPhase}`);
  }

  // Work nature (optional)
  if (params.skill.workNature) {
    sections.push(`Work nature: ${params.skill.workNature}`);
  }

  // Hints (optional)
  if (params.skill.hints && params.skill.hints.length > 0) {
    sections.push("");
    sections.push("### Hints");
    sections.push("");
    for (const hint of params.skill.hints) {
      sections.push(`- [${hint.command}] ${hint.tag}: ${hint.description}`);
    }
  }

  // Fix issues (optional)
  if (params.skill.fixIssues && params.skill.fixIssues.length > 0) {
    sections.push("");
    sections.push("### Issues to Fix");
    sections.push("");
    for (const issue of params.skill.fixIssues) {
      sections.push(`- ${issue.severity}: ${issue.description}`);
    }
  }

  // PUA Quality Engine injection (after SKILL Context, before Execution Mode)
  if (params.puaContext !== undefined) {
    sections.push("");
    sections.push("## PUA Quality Engine");
    sections.push("");
    sections.push(params.puaContext.pressurePrompt);

    // L3/L4: additionally inject Proactive Initiative Checklist
    if (params.puaContext.pressureLevel === "L3" || params.puaContext.pressureLevel === "L4") {
      sections.push("");
      sections.push(PROACTIVE_INITIATIVE_CHECKLIST);
    }
  }

  // Autonomous mode directive (always present)
  sections.push("");
  sections.push("## Execution Mode");
  sections.push("");
  sections.push(
    "mode: autonomous — Skip all confirmation points and use preset strategies. Do not wait for user input.",
  );

  return `${basePrompt}\n\n${sections.join("\n")}`;
}
