/**
 * @deprecated Superseded by code-review-graph (CRG) code knowledge graph.
 * CRG provides AST-level queries at ~100 tokens vs ~3K for batch scripts.
 * This module is retained for backward compatibility; prefer CRG when available.
 *
 * forge_read_cached — read file with cache-based deduplication.
 *
 * Returns full content on first read, cached message on subsequent reads
 * of unchanged files, and diff for modified files.
 *
 * Layer 1 of the five-layer context explosion defense.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResolvedRoot } from "../project-root.js";
import type { ReadCacheIndex } from "../read-cache.js";
import { loadOrCreateIndex, lookup, persistIndex, update } from "../read-cache.js";
import { getFileHash } from "../read-cache-hash.js";
import { validateSinglePath } from "./path-validator.js";

// ---------------------------------------------------------------------------
// Core logic (exported for testing)
// ---------------------------------------------------------------------------

export interface ReadCachedResult {
  cached: boolean;
  content: string;
}

/**
 * Handle a cached read request. Pure logic — no MCP dependencies.
 */
export async function handleReadCached(
  index: ReadCacheIndex,
  path: string,
  startLine?: number,
  endLine?: number,
): Promise<ReadCachedResult> {
  try {
    // Compute current hash
    const currentHash = await getFileHash(path);

    // Check cache
    const cached = lookup(index, path, startLine, endLine);

    if (cached && cached.gitHash === currentHash) {
      // File unchanged — return cached message
      return {
        cached: true,
        content: `[cached] ${path}: unchanged since last read (${cached.charCount} chars)`,
      };
    }

    // File changed or first read — read content
    const raw = await readFile(path, "utf-8");
    let content = raw;

    // Apply line range if specified
    if (startLine !== undefined || endLine !== undefined) {
      const lines = raw.split("\n");
      const start = (startLine ?? 1) - 1; // 0-indexed
      const end = endLine ?? lines.length;
      content = lines.slice(start, end).join("\n");
    }

    // Update cache
    update(
      index,
      path,
      currentHash,
      currentHash,
      content.length,
      startLine !== undefined && endLine !== undefined ? [startLine, endLine] : undefined,
    );

    // Persist cache to disk (fail-open)
    await persistIndex(index);

    return { cached: false, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { cached: false, content: `Error reading ${path}: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = [
  "Read a file with cache-based deduplication.",
  "",
  "First read returns full content. Subsequent reads of unchanged files",
  "return a cached message instead of re-reading the content into context.",
  "Modified files return only the new content.",
  "",
  "Use for: any file you may read multiple times in a session.",
  "NOT for: batch analysis (use forge_read instead).",
].join("\n");

/**
 * Derive a stable, per-project session id from the resolved root path so caches
 * are isolated per project instead of collapsing every project into a single
 * shared "mcp-default" file (which caused cross-project hash collisions and
 * made the cache useless across projects). Falls back to the process pid when
 * no root is bound.
 */
function deriveSessionId(root?: ResolvedRoot): string {
  if (root?.path) {
    return createHash("sha1").update(root.path).digest("hex").slice(0, 16);
  }
  return `proc-${process.pid}`;
}

/**
 * Register the `forge_read_cached` tool on the given MCP server.
 *
 * `sessionId` overrides the derived per-project id (useful for tests). When an
 * external `index` is provided it is used directly and no persistence occurs.
 */
export function registerForgeReadCached(
  server: McpServer,
  root?: ResolvedRoot,
  index?: ReadCacheIndex,
  sessionId?: string,
): void {
  // Track whether an external index was provided (for testing)
  const externalIndex = index;
  const resolvedSessionId = sessionId ?? deriveSessionId(root);

  // Serialize reads that share a session index. The read path is a
  // load → read → update → persist cycle that overwrites the whole cache file;
  // without serialization, concurrent reads clobber each other's entries.
  // This in-process promise chain makes overlapping reads run one at a time
  // while preserving async semantics for the caller.
  let readChain: Promise<unknown> = Promise.resolve();

  server.tool(
    "forge_read_cached",
    TOOL_DESCRIPTION,
    {
      path: z.string().describe("File path to read"),
      start_line: z.number().optional().describe("Start line (1-indexed)"),
      end_line: z.number().optional().describe("End line (inclusive)"),
    },
    async ({ path: filePath, start_line, end_line }) => {
      let resolvedPath: string;
      if (root) {
        resolvedPath = resolvePath(root.path, filePath);
        // Prevent path traversal using shared validator (handles prefix attacks)
        if (!validateSinglePath(filePath, root.path)) {
          return {
            content: [
              { type: "text" as const, text: `Error: path traversal blocked: ${filePath}` },
            ],
            isError: true,
          };
        }
      } else {
        resolvedPath = filePath;
      }

      // Serialize per-session read-modify-write to avoid lost updates. Each
      // call attaches to the tail of the chain; the result is threaded back
      // through the same promise so callers still await their own outcome.
      const run = async (): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
        const cacheIndex = externalIndex ?? (await loadOrCreateIndex(resolvedSessionId));
        const result = await handleReadCached(cacheIndex, resolvedPath, start_line, end_line);
        return { content: [{ type: "text" as const, text: result.content }] };
      };

      if (externalIndex) {
        // External (test) index — no persistence, but still serialize to keep
        // concurrent updates to the shared in-memory index consistent.
        const result = run();
        readChain = readChain.then(
          () => result,
          () => result,
        );
        return result;
      }

      const result = readChain.then(run, run);
      readChain = result;
      return result;
    },
  );
}
