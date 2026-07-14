/**
 * forge_read — batch file analysis via structured, safe read operations.
 *
 * P3-3: script mode (user-provided JavaScript run in a Node `vm` sandbox) has
 * been REMOVED. The tool now exposes only structured operations (imports /
 * contains / line_count / json_keys) that read files and return derived
 * analysis without ever executing user code. The Node `vm` module is no longer
 * a trust boundary in this tool.
 *
 * **Validates: Requirement 4**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResolvedRoot } from "../project-root.js";
import { validatePaths } from "./path-validator.js";

// Re-export for backward compatibility with existing imports
export { validatePaths, validateSinglePath } from "./path-validator.js";

// ---------------------------------------------------------------------------
// Structured capability operations
// ---------------------------------------------------------------------------

export type StructuredReadOperation = "imports" | "contains" | "line_count" | "json_keys";

export interface StructuredReadInput {
  operation: StructuredReadOperation;
  paths: string[];
  query?: string;
}

export interface StructuredReadResult {
  ok: boolean;
  output: string;
}

function readStructuredFiles(
  paths: string[],
  rootPath: string,
): Array<{ path: string; content: string }> {
  return paths.map((path) => ({
    path,
    content: readFileSync(resolve(rootPath, path), "utf-8"),
  }));
}

function extractImports(content: string): string[] {
  const imports = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^'";]+?\s+from\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) imports.add(match[1]);
  }

  return [...imports].sort();
}

export async function runStructuredReadOperation(
  input: StructuredReadInput,
  options?: { cwd?: string },
): Promise<StructuredReadResult> {
  const rootPath = options?.cwd ? resolve(options.cwd) : process.cwd();
  const pathError = validatePaths(input.paths, rootPath);
  if (pathError) return { ok: false, output: pathError };

  try {
    const files = readStructuredFiles(input.paths, rootPath);

    switch (input.operation) {
      case "imports": {
        const result = files.map((file) => ({
          path: file.path,
          imports: extractImports(file.content),
        }));
        return { ok: true, output: JSON.stringify(result, null, 2) };
      }
      case "contains": {
        if (typeof input.query !== "string") {
          return { ok: false, output: "contains operation requires query" };
        }
        const query = input.query;
        const result = files.map((file) => ({
          path: file.path,
          contains: file.content.includes(query),
        }));
        return { ok: true, output: JSON.stringify(result, null, 2) };
      }
      case "line_count": {
        const result = files.map((file) => ({
          path: file.path,
          lines:
            file.content.length === 0
              ? 0
              : file.content.endsWith("\n")
                ? file.content.slice(0, -1).split("\n").length
                : file.content.split("\n").length,
        }));
        return { ok: true, output: JSON.stringify(result, null, 2) };
      }
      case "json_keys": {
        const result = files.map((file) => {
          const parsed = JSON.parse(file.content) as unknown;
          const keys =
            parsed && typeof parsed === "object" && !Array.isArray(parsed)
              ? Object.keys(parsed).sort()
              : [];
          return { path: file.path, keys };
        });
        return { ok: true, output: JSON.stringify(result, null, 2) };
      }
      default:
        return {
          ok: false,
          output: `Unsupported structured operation: ${String(input.operation)}`,
        };
    }
  } catch (err: unknown) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = [
  "Analyze multiple files through structured, safe read operations.",
  "",
  "Operations:",
  "- imports: extract import/export/require module specifiers",
  "- contains: return whether each file contains query without echoing file contents",
  "- line_count: count lines per file",
  "- json_keys: list top-level keys in JSON object files",
  "",
  "Use for: batch structural analysis, dependency graphs, code metrics.",
  "NOT for: file mutations or interactive commands.",
].join("\n");

/**
 * Register the `forge_read` tool on the given MCP server.
 */
export function registerForgeRead(server: McpServer, root?: ResolvedRoot): void {
  server.registerTool(
    "forge_read",
    {
      description: TOOL_DESCRIPTION,
      inputSchema: {
        paths: z.array(z.string()).describe("File paths to analyze"),
        operation: z
          .enum(["imports", "contains", "line_count", "json_keys"])
          .describe("Structured safe read operation (required)"),
        query: z.string().optional().describe("Query string for contains operation"),
      },
      _meta: {
        "anthropic/maxResultSizeChars": 200_000,
      },
    },
    async ({ paths, operation, query }) => {
      if (!operation) {
        return {
          content: [
            {
              type: "text" as const,
              text: "forge_read requires `operation` (imports/contains/line_count/json_keys). Script mode has been removed.",
            },
          ],
          isError: true,
        };
      }
      const result = await runStructuredReadOperation(
        { operation, paths, query },
        root ? { cwd: root.path } : undefined,
      );
      return {
        content: [{ type: "text" as const, text: result.output }],
        isError: result.ok ? undefined : true,
      };
    },
  );
}
