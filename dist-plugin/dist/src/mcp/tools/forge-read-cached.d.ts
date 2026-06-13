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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ResolvedRoot } from "../project-root.js";
import type { ReadCacheIndex } from "../read-cache.js";
export interface ReadCachedResult {
    cached: boolean;
    content: string;
}
/**
 * Handle a cached read request. Pure logic — no MCP dependencies.
 */
export declare function handleReadCached(index: ReadCacheIndex, path: string, startLine?: number, endLine?: number): Promise<ReadCachedResult>;
/**
 * Register the `forge_read_cached` tool on the given MCP server.
 *
 * `sessionId` overrides the derived per-project id (useful for tests). When an
 * external `index` is provided it is used directly and no persistence occurs.
 */
export declare function registerForgeReadCached(server: McpServer, root?: ResolvedRoot, index?: ReadCacheIndex, sessionId?: string): void;
