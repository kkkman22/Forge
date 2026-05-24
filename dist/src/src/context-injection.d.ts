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
/**
 * A single context entry recorded at runtime by a Subagent.
 *
 * Stored as one JSON line in `.forge/runs/<runId>/context.jsonl`.
 */
export interface ContextEntry {
    /** File path (may include line range, e.g. "src/auth.ts:42-60"). */
    file: string;
    /** Human-readable reason this file was added to context. */
    reason: string;
    /** Task identifier that discovered this dependency. */
    task: string;
}
/**
 * Append a single {@link ContextEntry} as a JSONL line to the given file.
 *
 * Uses `appendFileSync` which maps to a POSIX O_APPEND write, ensuring
 * atomic line-level appends even when multiple Subagents write concurrently.
 *
 * @param filePath  Absolute or relative path to the context.jsonl file.
 * @param entry     The context entry to append.
 */
export declare function appendContextEntry(filePath: string, entry: ContextEntry): void;
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
export declare function readContextEntries(filePath: string): ContextEntry[];
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
export declare function mergeContextSources(planContextFiles: string[], jsonlEntries: ContextEntry[]): string[];
