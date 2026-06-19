/**
 * Wiring layer for context-injection (spec context-injection-activation).
 *
 * `src/context-injection.ts` provides the JSONL read/write primitives and the
 * merge function, but historically had zero production callers — it was a
 * scaffold that was never wired in. This module is the consumer that closes
 * the loop:
 *
 *   - `parsePlanContextFiles` reads the plan frontmatter `context_files`
 *     field (previously parsed by plan-file schema but never consumed).
 *   - `resolveContextFiles` merges plan frontmatter (static) with
 *     `.forge/runs/<runId>/context.jsonl` (dynamic) via `mergeContextSources`.
 *
 * Skill instructions (review/decide) call `resolveContextFiles` to populate
 * the `contextFiles` field of `ReviewSubagentContext` / `DecideContext`, so
 * subagent prompts receive the relevant spec/research file list.
 *
 * @module context-injection-wiring
 */

import { mergeContextSources, readContextEntries } from "./context-injection.js";

/**
 * Parse the `context_files` field from a plan markdown frontmatter block.
 *
 * Accepts both block-flow YAML lists and inline-flow arrays. Returns an empty
 * array when the frontmatter is absent or the field is missing.
 *
 * @param planContent  Raw plan markdown (with leading `---` frontmatter).
 * @returns List of file path strings declared in `context_files`.
 */
export function parsePlanContextFiles(planContent: string): string[] {
  if (typeof planContent !== "string" || planContent.trim() === "") return [];

  // Extract frontmatter block between leading --- fences.
  const fmMatch = planContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return [];
  const frontmatter = fmMatch[1];

  // Try block-flow first: `context_files:` followed by `- item` lines.
  const blockMatch = frontmatter.match(/^context_files:\s*\r?\n((?:\s*-\s+.+\r?\n?)+)/m);
  if (blockMatch) {
    const items = blockMatch[1]
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*-\s+(.+?)\s*$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => stripQuotes(m[1]));
    return items.filter((s) => s.length > 0);
  }

  // Inline-flow: `context_files: [a, b]`
  const inlineMatch = frontmatter.match(/^context_files:\s*\[([^\]]*)\]\s*$/m);
  if (inlineMatch) {
    return inlineMatch[1]
      .split(",")
      .map((s) => stripQuotes(s.trim()))
      .filter((s) => s.length > 0);
  }

  // Single scalar: `context_files: a.md` (unusual but tolerate)
  const scalarMatch = frontmatter.match(/^context_files:\s+(\S+)\s*$/m);
  if (scalarMatch) {
    return [stripQuotes(scalarMatch[1])].filter((s) => s.length > 0);
  }

  return [];
}

function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Merge static (plan frontmatter) and dynamic (context.jsonl) context file
 * references into a single deduplicated list.
 *
 * This is the production caller of {@link mergeContextSources} +
 * {@link readContextEntries} — wiring the previously-unused primitives into a
 * usable resolution function.
 *
 * @param planContextFiles  File paths declared in plan frontmatter (static).
 * @param jsonlPath         Path to `.forge/runs/<runId>/context.jsonl`. May not
 *                          exist yet (returns plan files only).
 * @returns Deduplicated file path list (plan entries first).
 */
export function resolveContextFiles(planContextFiles: string[], jsonlPath: string): string[] {
  const jsonlEntries = readContextEntries(jsonlPath);
  return mergeContextSources(planContextFiles, jsonlEntries);
}
