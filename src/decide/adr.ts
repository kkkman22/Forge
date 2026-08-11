/**
 * ADR lifecycle — path helpers, rendering, and finalization.
 *
 * @module decide/adr
 */

import { type AdrEntry, applySupersession, nextAdrId, renderAdrIndex } from "../adr-registry.js";
import { parseFrontmatter } from "../frontmatter.js";
import type { AdrSupersessionUpdate, FinalizeAdrInput, FinalizeAdrOutput } from "./types.js";

/** Canonical path of the ADR index file. */
const ADR_INDEX_PATH = ".tinkerman/knowledge/adr-index.md";

/**
 * Convert a topic string to kebab-case.
 *
 * Rules:
 *  - Lowercase the entire string
 *  - Replace whitespace and non-alphanumeric/non-hyphen characters with hyphens
 *  - Collapse consecutive hyphens into one
 *  - Trim leading/trailing hyphens
 *  - If result is empty, fallback to "untitled-<4-char-hash>"
 */
export function toKebabCase(topic: string): string {
  const result = topic
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  if (result.length > 0) {
    return result;
  }

  // Fallback for non-ASCII input: generate a readable prefix + short hash
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    const char = topic.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(4, "0").slice(0, 4);
  return `untitled-${hex}`;
}

/**
 * Generate the decision document output path.
 */
export function generateDecisionPath(date: string, topic: string): string {
  const kebabTopic = toKebabCase(topic);
  return `.tinkerman/decisions/${date}-${kebabTopic}.md`;
}

/**
 * Escape a string for emission inside a double-quoted YAML scalar.
 */
function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Render the indented-list form of a string array as YAML lines.
 */
function renderYamlList(items: string[]): string[] {
  return items.map((item) => `  - "${escapeYamlString(item)}"`);
}

/**
 * Render the full ADR markdown document for an AdrEntry and its body.
 *
 * This function is pure and has no IO.
 */
export function renderAdrFileContent(entry: AdrEntry, bodyMarkdown: string): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`id: "${escapeYamlString(entry.id)}"`);
  lines.push(`title: "${escapeYamlString(entry.title)}"`);
  lines.push(`status: ${entry.status}`);
  lines.push(`date: "${escapeYamlString(entry.date)}"`);
  lines.push("deciders:");
  lines.push(...renderYamlList(entry.deciders));

  if (entry.reversibility !== undefined) {
    lines.push(`reversibility: ${entry.reversibility}`);
  }

  if (entry.surprising !== undefined) {
    lines.push(`surprising: ${entry.surprising ? "true" : "false"}`);
  }

  if (entry.trade_off_alternatives !== undefined && entry.trade_off_alternatives.length > 0) {
    lines.push("trade_off_alternatives:");
    lines.push(...renderYamlList(entry.trade_off_alternatives));
  }

  if (entry.related_adrs !== undefined && entry.related_adrs.length > 0) {
    lines.push("related_adrs:");
    lines.push(...renderYamlList(entry.related_adrs));
  }

  if (entry.supersedes !== undefined && entry.supersedes !== "") {
    lines.push(`supersedes: "${escapeYamlString(entry.supersedes)}"`);
  }

  if (entry.superseded_by !== undefined && entry.superseded_by !== "") {
    lines.push(`superseded_by: "${escapeYamlString(entry.superseded_by)}"`);
  }

  lines.push("---");
  lines.push("");
  return `${lines.join("\n")}\n${bodyMarkdown}`;
}

/**
 * Extract the body from an existing ADR file.
 */
function extractBody(existingContent: string): string {
  const parsed = parseFrontmatter(existingContent);
  if (parsed === null) {
    return existingContent;
  }
  return parsed.body;
}

/**
 * Merge the new ADR entry and any supersession updates into the existing
 * list, producing a list in which every id appears exactly once.
 */
function mergeEntriesForIndex(
  existingAdrs: AdrEntry[],
  newEntry: AdrEntry,
  updates: AdrEntry[],
): AdrEntry[] {
  const updatedById = new Map<string, AdrEntry>();
  for (const update of updates) {
    updatedById.set(update.id, update);
  }

  const merged: AdrEntry[] = [];
  const seen = new Set<string>();

  for (const entry of existingAdrs) {
    if (entry.id === newEntry.id) {
      continue;
    }
    const effective = updatedById.get(entry.id) ?? entry;
    if (seen.has(effective.id)) {
      continue;
    }
    merged.push(effective);
    seen.add(effective.id);
  }

  if (!seen.has(newEntry.id)) {
    merged.push(newEntry);
  }

  return merged;
}

/**
 * Finalize an ADR at the end of `/tinkerman decide`.
 *
 * The function is pure: all IO is injected through the `readExistingFile`
 * callback. The caller writes the returned artifacts to disk.
 */
export function finalizeAdr(
  input: FinalizeAdrInput,
  readExistingFile: (path: string) => string | undefined,
): FinalizeAdrOutput {
  const id = nextAdrId(input.existingAdrs);
  const slug = toKebabCase(input.topic);
  const adrFilePath = `.tinkerman/decisions/${id}-${slug}.md`;

  const newEntry: AdrEntry = {
    id,
    title: input.title,
    status: input.status,
    date: input.date,
    deciders: [...input.deciders],
    filePath: adrFilePath,
  };

  if (input.relatedAdrs !== undefined && input.relatedAdrs.length > 0) {
    newEntry.related_adrs = [...input.relatedAdrs];
  }
  if (input.supersedes !== undefined && input.supersedes !== "") {
    newEntry.supersedes = input.supersedes;
  }

  if (input.reversibility !== undefined) {
    newEntry.reversibility = input.reversibility;
  }
  if (input.surprising !== undefined) {
    newEntry.surprising = input.surprising;
  }
  if (input.tradeOffAlternatives !== undefined && input.tradeOffAlternatives.length > 0) {
    newEntry.trade_off_alternatives = [...input.tradeOffAlternatives];
  }

  const supersededEntries = applySupersession(newEntry, input.existingAdrs);

  const supersessionUpdates: AdrSupersessionUpdate[] = [];
  for (const updated of supersededEntries) {
    const originalContent = readExistingFile(updated.filePath);
    const body = originalContent === undefined ? "" : extractBody(originalContent);
    supersessionUpdates.push({
      filePath: updated.filePath,
      updatedContent: renderAdrFileContent(updated, body),
    });
  }

  const adrFileContent = renderAdrFileContent(newEntry, input.bodyMarkdown);

  const mergedForIndex = mergeEntriesForIndex(input.existingAdrs, newEntry, supersededEntries);
  const indexContent = renderAdrIndex(mergedForIndex);

  return {
    newEntry,
    adrFilePath,
    adrFileContent,
    indexFilePath: ADR_INDEX_PATH,
    indexContent,
    supersessionUpdates,
  };
}
