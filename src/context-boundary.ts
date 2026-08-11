/**
 * Context boundary checker — validates that source code imports don't violate
 * declared Context Map relationships between Bounded Contexts.
 *
 * Public API:
 *   - loadOwnershipMap
 *   - resolveFileContext
 *   - parseImports
 *   - checkBoundary
 */

import { existsSync, readFileSync } from "node:fs";

import type { ContextMapEntry } from "./pack/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BoundaryCheckInput {
  filePath: string;
  fileContent: string;
  contextMap: ContextMapEntry[];
  /** glob pattern → context name */
  ownershipMap: Record<string, string>;
}

export interface BoundaryViolation {
  sourceContext: string;
  targetContext: string;
  importStatement: string;
  line: number;
  relationshipType: string | "undeclared";
  suggestion: string;
}

export interface BoundaryCheckResult {
  violations: BoundaryViolation[];
  escapeHatchUsed: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Relationships that are allowed between contexts. */
const ALLOWED_RELATIONSHIPS: ReadonlySet<string> = new Set(["partnership", "shared-kernel", "acl"]);

/** Relationships that are allowed only when the target is the provider. */
const PROVIDER_RELATIONSHIPS: ReadonlySet<string> = new Set(["open-host", "published-language"]);

/** Relationships that are blocked. */
const BLOCKED_RELATIONSHIPS: ReadonlySet<string> = new Set(["customer-supplier", "conformist"]);

// ---------------------------------------------------------------------------
// Import parsing constants
// ---------------------------------------------------------------------------

/** Escape hatch marker on the line preceding an import. */
const ESCAPE_HATCH_RE = /@forge:allow-cross-context/;

// ---------------------------------------------------------------------------
// loadOwnershipMap
// ---------------------------------------------------------------------------

/**
 * Load ownership map from .tinkerman/context-ownership.yaml.
 * Parses YAML map format under `mappings:` key.
 * Returns empty object when file doesn't exist or is malformed.
 */
export function loadOwnershipMap(
  _projectRoot: string,
  ownershipYamlPath: string,
): Record<string, string> {
  const mappings: Record<string, string> = {};

  if (!existsSync(ownershipYamlPath)) {
    return mappings;
  }

  try {
    const content = readFileSync(ownershipYamlPath, "utf-8");
    parseYamlMappings(content, mappings);
  } catch (_e) {
    // Malformed YAML — fall back to empty mappings silently.
    // Upstream callers decide whether the hook should be a no-op or warn.
  }

  return mappings;
}

/** Parse YAML-style mappings from content. */
function parseYamlMappings(content: string, mappings: Record<string, string>): void {
  const lines = content.split("\n");
  let inMappings = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Detect start of mappings block
    if (/^mappings:\s*$/.test(line)) {
      inMappings = true;
      continue;
    }

    // Exit mappings block on next top-level key
    if (inMappings && /^[a-zA-Z]/.test(line) && !line.startsWith('"')) {
      // Check if it's a top-level key (no indent)
      if (rawLine === rawLine.trimStart() && !/^"/.test(line)) {
        inMappings = false;
        continue;
      }
    }

    if (!inMappings) continue;

    // Parse "glob": context or glob: context
    const quotedMatch = line.match(/^["']([^"']+)["']\s*:\s*(.+)/);
    if (quotedMatch) {
      const glob = quotedMatch[1].trim();
      const context = quotedMatch[2].trim().replace(/^['"]|['"]$/g, "");
      if (glob && context) mappings[glob] = context;
      continue;
    }

    const plainMatch = line.match(/^(\S+)\s*:\s*(.+)/);
    if (plainMatch) {
      const glob = plainMatch[1].trim();
      const context = plainMatch[2].trim().replace(/^['"]|['"]$/g, "");
      if (glob && context && glob !== "schema_version") mappings[glob] = context;
    }
  }
}

// ---------------------------------------------------------------------------
// resolveFileContext
// ---------------------------------------------------------------------------

/**
 * Extract JSDoc @context tag from first 30 lines of file content.
 */
export function extractJsdocContext(fileContent: string): string | null {
  const first30Lines = fileContent.split("\n").slice(0, 30).join("\n");
  const match = first30Lines.match(/@context\s+([a-z][a-z0-9-]*)/);
  return match ? match[1] : null;
}

/**
 * Determine which bounded context a file belongs to.
 *
 * Priority:
 *  1. JSDoc-annotated context (if provided)
 *  2. Directory-prefix match against ownership map globs
 *  3. No match → null
 */
export function resolveFileContext(
  filePath: string,
  ownershipMap: Record<string, string>,
  jsdocContext: string | null,
): string | null {
  if (jsdocContext !== null) {
    return jsdocContext;
  }

  // Normalise path separators
  const normalised = filePath.replace(/\\/g, "/");

  // Sort globs longest-first so more specific patterns win
  const globs = Object.keys(ownershipMap).sort((a, b) => b.length - a.length);

  for (const glob of globs) {
    if (globMatches(normalised, glob)) {
      return ownershipMap[glob];
    }
  }

  return null;
}

/**
 * Simple glob matching: supports `**` (any depth) and `*` (single segment).
 * For directory-prefix matching the typical pattern is `src/domain/foo/**`.
 */
function globMatches(filePath: string, glob: string): boolean {
  // Convert glob to regex
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{DOUBLESTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{DOUBLESTAR}}/g, ".*");

  const re = new RegExp(`^${escaped}$`);
  return re.test(filePath);
}

// ---------------------------------------------------------------------------
// parseImports
// ---------------------------------------------------------------------------

/**
 * Parse TypeScript import statements from source code.
 * Detects escape-hatch comments (`// @forge:allow-cross-context <reason>`)
 * on the line immediately preceding each import.
 */
export function parseImports(
  fileContent: string,
): Array<{ module: string; line: number; hasEscapeHatch: boolean }> {
  const lines = fileContent.split("\n");
  const results: Array<{
    module: string;
    line: number;
    hasEscapeHatch: boolean;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/import\s+(?:[\w{},\s*]+\s+from\s+)?["']([^"']+)["']/);
    if (match) {
      const hasEscapeHatch = i > 0 && ESCAPE_HATCH_RE.test(lines[i - 1]);
      results.push({
        module: match[1],
        line: i + 1, // 1-indexed
        hasEscapeHatch,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// checkBoundary
// ---------------------------------------------------------------------------

/**
 * Main boundary checker.
 *
 * 1. Resolve which context the file belongs to.
 * 2. Parse imports from the file content.
 * 3. For each import, resolve the imported module's context.
 * 4. Check whether the context-map relationship allows the import.
 * 5. Count escape-hatch uses.
 */
export function checkBoundary(input: BoundaryCheckInput): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];
  let escapeHatchUsed = 0;

  const jsdocContext = extractJsdocContext(input.fileContent);
  const sourceContext = resolveFileContext(input.filePath, input.ownershipMap, jsdocContext);

  // File not in any context → no-op
  if (sourceContext === null) {
    return { violations: [], escapeHatchUsed: 0 };
  }

  const imports = parseImports(input.fileContent);

  for (const imp of imports) {
    // Skip node built-in / package imports (no relative path)
    if (!imp.module.startsWith(".")) {
      continue;
    }

    const targetContext = resolveImportContext(input.filePath, imp.module, input.ownershipMap);

    // Import does not resolve to any context → skip
    if (targetContext === null) {
      continue;
    }

    // Same context → always allowed
    if (targetContext === sourceContext) {
      continue;
    }

    // Escape hatch → bypass and count
    if (imp.hasEscapeHatch) {
      escapeHatchUsed++;
      continue;
    }

    // Look up relationship in context map
    const relationship = findRelationship(sourceContext, targetContext, input.contextMap);

    if (relationship === null) {
      // Undeclared
      violations.push({
        sourceContext,
        targetContext,
        importStatement: imp.module,
        line: imp.line,
        relationshipType: "undeclared",
        suggestion:
          `Add a declared relationship between "${sourceContext}" and "${targetContext}" in your context map, ` +
          `or use an ACL to mediate the dependency.`,
      });
      continue;
    }

    if (ALLOWED_RELATIONSHIPS.has(relationship)) {
      continue; // partnership, shared-kernel, acl — always allowed
    }

    if (PROVIDER_RELATIONSHIPS.has(relationship)) {
      // open-host / published-language: allowed when source is consumer
      // importing from the provider (target). In the context map entry,
      // source = consumer, target = provider. Since we're importing
      // FROM the target, this is allowed.
      continue;
    }

    if (BLOCKED_RELATIONSHIPS.has(relationship)) {
      const suggestion =
        relationship === "customer-supplier"
          ? `Introduce an ACL (Anti-Corruption Layer) between "${sourceContext}" and "${targetContext}" to mediate the supplier dependency.`
          : `Replace the conformist relationship with an ACL between "${sourceContext}" and "${targetContext}".`;

      violations.push({
        sourceContext,
        targetContext,
        importStatement: imp.module,
        line: imp.line,
        relationshipType: relationship,
        suggestion,
      });
    }
  }

  return { violations, escapeHatchUsed };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the context for an imported module path relative to the importing file.
 */
function resolveImportContext(
  importerPath: string,
  importPath: string,
  ownershipMap: Record<string, string>,
): string | null {
  // Resolve relative import to a full path
  const dir = importerPath.replace(/[^/]*$/, "");
  const resolved = normalisePath(dir + importPath);

  return resolveFileContext(resolved, ownershipMap, null);
}

/**
 * Normalise a path: resolve `.` and `..` segments.
 */
function normalisePath(p: string): string {
  const segments = p.replace(/\\/g, "/").split("/");
  const result: string[] = [];

  for (const seg of segments) {
    if (seg === "..") {
      result.pop();
    } else if (seg !== "." && seg !== "") {
      result.push(seg);
    }
  }

  return result.join("/");
}

/**
 * Find the relationship type between two contexts in the context map.
 * Checks both directions (source→target and target→source).
 */
function findRelationship(
  source: string,
  target: string,
  contextMap: ContextMapEntry[],
): string | null {
  for (const entry of contextMap) {
    if (entry.source === source && entry.target === target) {
      return entry.type;
    }
    // For symmetric relationships, check reverse direction
    if (entry.target === source && entry.source === target) {
      // Partnership and shared-kernel are symmetric
      if (entry.type === "partnership" || entry.type === "shared-kernel") {
        return entry.type;
      }
    }
  }
  return null;
}
