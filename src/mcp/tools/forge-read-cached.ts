/**
 * forge_read_cached — read file with cache-based deduplication.
 *
 * Returns full content on first read, cached message on subsequent reads
 * of unchanged files, and diff for modified files.
 *
 * Layer 1 of the five-layer context explosion defense.
 */

import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResolvedRoot } from "../project-root.js";
import type { ReadCacheIndex } from "../read-cache.js";
import { lookup, update } from "../read-cache.js";
import { getFileHash } from "../read-cache-hash.js";

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
      startLine && endLine ? [startLine, endLine] : undefined,
    );

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
 * Register the `forge_read_cached` tool on the given MCP server.
 */
export function registerForgeReadCached(
  server: McpServer,
  root?: ResolvedRoot,
  index?: ReadCacheIndex,
): void {
  // Use provided index or create a session-scoped one
  const cacheIndex = index ?? { sessionId: "mcp-default", entries: {} };

  server.tool(
    "forge_read_cached",
    TOOL_DESCRIPTION,
    {
      path: z.string().describe("File path to read"),
      start_line: z.number().optional().describe("Start line (1-indexed)"),
      end_line: z.number().optional().describe("End line (inclusive)"),
    },
    async ({ path, start_line, end_line }) => {
      const resolvedPath = root ? `${root.path}/${path}` : path;
      const result = await handleReadCached(cacheIndex, resolvedPath, start_line, end_line);

      return {
        content: [{ type: "text" as const, text: result.content }],
      };
    },
  );
}
