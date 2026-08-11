/**
 * Sub-Agent dynamic context injection module.
 *
 * Provides JSONL-based read/write for runtime context entries and a merge
 * function that combines static (plan frontmatter) and dynamic (JSONL)
 * context file references with deduplication.
 *
 * All I/O functions use atomic append (POSIX append-only semantics) to
 * support concurrent Subagent writes without file locks.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6**
 */

import { appendFileSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single context entry recorded at runtime by a Subagent.
 *
 * Stored as one JSON line in `.tinkerman/runs/<runId>/context.jsonl`.
 */
export interface ContextEntry {
  /** File path (may include line range, e.g. "src/auth.ts:42-60"). */
  file: string;
  /** Human-readable reason this file was added to context. */
  reason: string;
  /** Task identifier that discovered this dependency. */
  task: string;
}

// ---------------------------------------------------------------------------
// JSONL I/O
// ---------------------------------------------------------------------------

/**
 * Append a single {@link ContextEntry} as a JSONL line to the given file.
 *
 * Uses `appendFileSync` which maps to a POSIX O_APPEND write, ensuring
 * atomic line-level appends even when multiple Subagents write concurrently.
 *
 * @param filePath  Absolute or relative path to the context.jsonl file.
 * @param entry     The context entry to append.
 */
export function appendContextEntry(filePath: string, entry: ContextEntry): void {
  const line = `${JSON.stringify(entry)}\n`;
  appendFileSync(filePath, line, "utf-8");
}

/**
 * Read all {@link ContextEntry} records from a JSONL file.
 *
 * Silently skips blank lines and malformed JSON lines (defensive against
 * partial writes or trailing newlines). Returns an empty array when the
 * file does not exist or is empty.
 *
 * @param filePath  Absolute or relative path to the context.jsonl file.
 * @returns Array of parsed context entries.
 */
export function readContextEntries(filePath: string): ContextEntry[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (_err: unknown) {
    // File does not exist or is unreadable — return empty
    return [];
  }

  if (content.trim() === "") {
    return [];
  }

  const entries: ContextEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed) as ContextEntry;
      // Basic shape validation
      if (
        typeof parsed.file === "string" &&
        typeof parsed.reason === "string" &&
        typeof parsed.task === "string"
      ) {
        entries.push(parsed);
      }
    } catch (_err: unknown) {
      // Skip malformed lines
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Context merging
// ---------------------------------------------------------------------------

/**
 * Merge static (plan frontmatter `context_files`) and dynamic (JSONL)
 * context file references, deduplicating by file path.
 *
 * Static entries come first, followed by dynamic entries not already present.
 * Deduplication is based on the raw `file` string (including any line range).
 *
 * @param planContextFiles  File paths declared in plan frontmatter.
 * @param jsonlEntries      Entries read from context.jsonl at runtime.
 * @returns Deduplicated array of file paths.
 */
export function mergeContextSources(
  planContextFiles: string[],
  jsonlEntries: ContextEntry[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const file of planContextFiles) {
    if (!seen.has(file)) {
      seen.add(file);
      result.push(file);
    }
  }

  for (const entry of jsonlEntries) {
    if (!seen.has(entry.file)) {
      seen.add(entry.file);
      result.push(entry.file);
    }
  }

  return result;
}
