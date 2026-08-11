#!/usr/bin/env node

/**
 * Context boundary PreToolUse/PostToolUse hook.
 *
 * Checks Write/Edit operations against declared Context Map relationships.
 * Blocks cross-context imports that have no declared relationship or that
 * use a blocked relationship type (customer-supplier, conformist) without
 * an ACL or escape hatch.
 *
 * PreToolUse mode: inspects tool input content/new_string.
 * PostToolUse mode: reads file from disk after write completes.
 *
 * Usage: node scripts/check-context-boundary.mjs <mode> <tool-input-file>
 *   mode:            "Write", "Edit", or "PostToolUse"
 *   tool-input-file: path to temp file containing JSON of tool arguments
 *
 * Exit codes:
 *   0 — allow (no violations or file not applicable)
 *   1 — block (PreToolUse violations found, message on stderr)
 *   2 — block (PostToolUse violations found, message on stderr; triggers continueOnBlock)
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, join, dirname, normalize } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();

/** Relationships that are always allowed between contexts. */
const ALLOWED_RELATIONSHIPS = new Set([
  "partnership",
  "shared-kernel",
  "acl",
]);

/** Relationships that are allowed when importing from the provider. */
const PROVIDER_RELATIONSHIPS = new Set([
  "open-host",
  "published-language",
]);

/** Relationships that are blocked. */
const BLOCKED_RELATIONSHIPS = new Set([
  "customer-supplier",
  "conformist",
]);

/** Escape hatch marker. */
const ESCAPE_HATCH_RE = /@forge:allow-cross-context/;

// ---------------------------------------------------------------------------
// Import parsing
// ---------------------------------------------------------------------------

/**
 * Parse TypeScript import statements from source code.
 * Detects escape-hatch comments on the line immediately preceding each import.
 */
function parseImports(fileContent) {
  const lines = fileContent.split("\n");
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(
      /import\s+(?:[\w{},\s*]+\s+from\s+)?["']([^"']+)["']/,
    );
    if (match) {
      const hasEscapeHatch =
        i > 0 && ESCAPE_HATCH_RE.test(lines[i - 1]);
      results.push({
        module: match[1],
        line: i + 1,
        hasEscapeHatch,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

/**
 * Simple glob matching: supports `**` (any depth) and `*` (single segment).
 */
function globMatches(filePath, glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{DOUBLESTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{DOUBLESTAR}}/g, ".*");

  const re = new RegExp(`^${escaped}$`);
  return re.test(filePath);
}

// ---------------------------------------------------------------------------
// Context resolution
// ---------------------------------------------------------------------------

/**
 * Determine which bounded context a file belongs to.
 * Priority: directory-prefix match against ownership map globs (longest first).
 */
function resolveFileContext(filePath, ownershipMap) {
  const normalised = filePath.replace(/\\/g, "/");
  const globs = Object.keys(ownershipMap).sort((a, b) => b.length - a.length);

  for (const glob of globs) {
    if (globMatches(normalised, glob)) {
      return ownershipMap[glob];
    }
  }

  return null;
}

/**
 * Resolve the context for an imported module path relative to the importing file.
 */
function resolveImportContext(importerPath, importPath, ownershipMap) {
  const dir = importerPath.replace(/[^/]*$/, "");
  const resolved = normalisePath(dir + importPath);
  return resolveFileContext(resolved, ownershipMap);
}

/**
 * Normalise a path: resolve `.` and `..` segments.
 */
function normalisePath(p) {
  const segments = p.replace(/\\/g, "/").split("/");
  const result = [];

  for (const seg of segments) {
    if (seg === "..") {
      result.pop();
    } else if (seg !== "." && seg !== "") {
      result.push(seg);
    }
  }

  return result.join("/");
}

// ---------------------------------------------------------------------------
// Context map loading
// ---------------------------------------------------------------------------

/**
 * Find relationship between two contexts in the context map.
 * Checks both directions for symmetric relationships.
 */
function findRelationship(source, target, contextMap) {
  for (const entry of contextMap) {
    if (entry.source === source && entry.target === target) {
      return entry.type;
    }
    if (entry.target === source && entry.source === target) {
      if (entry.type === "partnership" || entry.type === "shared-kernel") {
        return entry.type;
      }
    }
  }
  return null;
}

/**
 * Load ownership map from .tinkerman/context-ownership.yaml.
 * Simple format: lines of `glob: contextName` or `glob:contextName`.
 * Lines starting with `#` are comments; blank lines are skipped.
 * Also supports YAML map format.
 */
function loadOwnershipMap() {
  const ownershipPath = resolve(PROJECT_ROOT, ".tinkerman/context-ownership.yaml");
  if (!existsSync(ownershipPath)) {
    return null;
  }

  try {
    const content = readFileSync(ownershipPath, "utf-8");
    const map = {};

    // Try YAML map format first (key: value lines)
    const lines = content.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;

      const match = line.match(/^["']?([^"':]+?)["']?\s*:\s*["']?([^"']+)["']?\s*$/);
      if (match) {
        const glob = match[1].trim();
        const context = match[2].trim();
        map[glob] = context;
      }
    }

    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}

/**
 * Load context map from _map.yaml files in pack directories.
 * Reads enabled packs from .tinkerman/custom/enabled-packs.json if it exists.
 */
function loadContextMap() {
  const entries = [];

  // 1. Load from enabled packs
  const enabledPacksPath = resolve(
    PROJECT_ROOT,
    ".tinkerman/custom/enabled-packs.json",
  );
  if (existsSync(enabledPacksPath)) {
    try {
      const enabledConfig = JSON.parse(
        readFileSync(enabledPacksPath, "utf-8"),
      );
      const packsDir = resolve(PROJECT_ROOT, "packs");

      if (enabledConfig.packs && Array.isArray(enabledConfig.packs)) {
        for (const packName of enabledConfig.packs) {
          const mapPath = resolve(
            packsDir,
            packName,
            "contexts",
            "_map.yaml",
          );
          if (existsSync(mapPath)) {
            loadMapYaml(mapPath, `pack:${packName}`, entries);
          }
        }
      }
    } catch {
      // Continue without pack maps
    }
  }

  // 2. Auto-discover: if no enabled-packs config, scan all pack directories
  if (entries.length === 0) {
    const packsDir = resolve(PROJECT_ROOT, "packs");
    if (existsSync(packsDir)) {
      try {
        const dirs = readdirSync(packsDir);
        for (const dir of dirs) {
          const mapPath = resolve(packsDir, dir, "contexts", "_map.yaml");
          if (existsSync(mapPath)) {
            loadMapYaml(mapPath, `pack:${dir}`, entries);
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // 3. Load custom layer (highest priority, overwrites)
  const customMapPath = resolve(
    PROJECT_ROOT,
    ".tinkerman/custom/contexts/_map.yaml",
  );
  if (existsSync(customMapPath)) {
    const customEntries = [];
    loadMapYaml(customMapPath, "custom", customEntries);
    // Custom overwrites pack entries
    for (const entry of customEntries) {
      const key = `${entry.source}::${entry.target}`;
      const existingIdx = entries.findIndex(
        (e) => `${e.source}::${e.target}` === key,
      );
      if (existingIdx >= 0) {
        entries[existingIdx] = entry;
      } else {
        entries.push(entry);
      }
    }
  }

  return entries;
}

/**
 * Parse a _map.yaml file and push entries into the array.
 * Handles the edge format: { edges: [{from, to, type}] }
 * Also handles { source, target, type } format.
 */
function loadMapYaml(filePath, layer, entries) {
  try {
    const content = readFileSync(filePath, "utf-8");

    // Simple YAML parser for the known _map.yaml format
    // Does not depend on the yaml npm package
    const edges = [];

    // Match edge entries in YAML
    // Format 1: - from: X / to: Y / type: Z
    // Format 2: - source: X / target: Y / type: Z
    const edgeBlocks = content.split(/\n\s*-\s+/).slice(1);

    for (const block of edgeBlocks) {
      const fromMatch = block.match(/(?:from|source):\s*["']?(\S+?)["']?\s*$/m);
      const toMatch = block.match(/(?:to|target):\s*["']?(\S+?)["']?\s*$/m);
      const typeMatch = block.match(/type:\s*["']?(\S+?)["']?\s*$/m);

      if (fromMatch && toMatch && typeMatch) {
        entries.push({
          source: fromMatch[1],
          target: toMatch[1],
          type: typeMatch[1],
          sourceLayer: layer,
        });
      }
    }
  } catch {
    // Silently skip unreadable files
  }
}

// ---------------------------------------------------------------------------
// Core boundary check
// ---------------------------------------------------------------------------

/**
 * Check a file's content for cross-context boundary violations.
 */
function checkBoundary(filePath, fileContent, ownershipMap, contextMap) {
  const violations = [];
  let escapeHatchUsed = 0;

  const sourceContext = resolveFileContext(filePath, ownershipMap);

  // File not in any context — no-op
  if (sourceContext === null) {
    return { violations: [], escapeHatchUsed: 0 };
  }

  const imports = parseImports(fileContent);

  for (const imp of imports) {
    // Skip non-relative imports (node built-ins, packages)
    if (!imp.module.startsWith(".")) {
      continue;
    }

    const targetContext = resolveImportContext(
      filePath,
      imp.module,
      ownershipMap,
    );

    // Import does not resolve to any context — skip
    if (targetContext === null) {
      continue;
    }

    // Same context — always allowed
    if (targetContext === sourceContext) {
      continue;
    }

    // Escape hatch — bypass and count
    if (imp.hasEscapeHatch) {
      escapeHatchUsed++;
      continue;
    }

    // Look up relationship
    const relationship = findRelationship(sourceContext, targetContext, contextMap);

    if (relationship === null) {
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
      continue;
    }

    if (PROVIDER_RELATIONSHIPS.has(relationship)) {
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
// Formatting
// ---------------------------------------------------------------------------

function formatViolationMessage(filePath, violations, escapeHatchUsed, chineseFormat = false) {
  if (chineseFormat) {
    const lines = [
      `[Forge] 上下文边界违规：${filePath}`,
      "",
    ];

    for (const v of violations) {
      lines.push(`  第 ${v.line} 行：import ${v.importStatement}`);
      lines.push(`    ${v.sourceContext} → ${v.targetContext}（关系：${v.relationshipType}）`);
      lines.push(`  修复建议：${v.suggestion}`);
      lines.push("");
    }

    if (escapeHatchUsed > 0) {
      lines.push(`  （${escapeHatchUsed} 个 import 通过 @forge:allow-cross-context 绕过）`);
    }

    return lines.join("\n");
  }
  const lines = [
    `Context Boundary Violation: ${filePath}`,
    "",
  ];

  for (const v of violations) {
    lines.push(`  Line ${v.line}: ${v.importStatement}`);
    lines.push(`    ${v.sourceContext} -> ${v.targetContext} (${v.relationshipType})`);
    lines.push(`    Fix: ${v.suggestion}`);
    lines.push("");
  }

  if (escapeHatchUsed > 0) {
    lines.push(`  (${escapeHatchUsed} import(s) bypassed via @forge:allow-cross-context)`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Duration tracking
// ---------------------------------------------------------------------------

/**
 * Append tool duration data to .tinkerman/runs/<date>/tool-durations.jsonl.
 * Only called in PostToolUse mode when duration_ms is present in tool input.
 */
function trackDuration(toolInput) {
  try {
    const duration = toolInput.duration_ms;
    if (duration === undefined || duration === null) return;

    const toolName = toolInput.tool_name || "unknown";
    const now = new Date();
    const dateDir = now.toISOString().slice(0, 10);

    const runsDir = resolve(PROJECT_ROOT, ".tinkerman", "runs", dateDir);
    mkdirSync(runsDir, { recursive: true });

    const entry = {
      tool: toolName,
      duration_ms: duration,
      timestamp: now.toISOString(),
    };

    const logFile = join(runsDir, "tool-durations.jsonl");
    appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Duration tracking failure is non-critical
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const toolType = process.env.TOOL_NAME || process.argv[2];
  const toolInputFile = process.env.TOOL_INPUT_FILE || process.argv[3];

  // --help support
  if (toolType === "--help" || toolType === "-h") {
    console.log(`Usage: node scripts/check-context-boundary.mjs <mode> <tool-input-file>

  mode:            "Write", "Edit", or "PostToolUse"
  tool-input-file: path to temp file containing JSON of tool arguments

  PreToolUse mode: inspects tool input content/new_string.
  PostToolUse mode: reads file from disk after write + tracks duration_ms.

  In PostToolUse mode, if the tool input contains duration_ms, it is
  appended to .tinkerman/runs/<date>/tool-durations.jsonl for performance analysis.

  Exit codes:
    0 — allow (no violations or file not applicable)
    1 — block (PreToolUse violations found)
    2 — block (PostToolUse violations found; triggers continueOnBlock)`);
    process.exit(0);
  }

  if (!toolType || !toolInputFile) {
    process.exit(0);
  }

  const isPostToolUse = toolType === "PostToolUse";

  // Only check Write, Edit, and PostToolUse
  if (toolType !== "Write" && toolType !== "Edit" && !isPostToolUse) {
    process.exit(0);
  }

  // Read tool input
  let toolInput;
  try {
    toolInput = JSON.parse(readFileSync(toolInputFile, "utf-8"));
  } catch {
    // Can't parse — allow
    process.exit(0);
  }

  // Track duration in PostToolUse mode
  if (isPostToolUse) {
    trackDuration(toolInput);
  }

  const filePath = (toolInput.file_path ?? toolInput.path ?? "") ;
  if (!filePath) {
    process.exit(0);
  }

  // Normalise to forward slashes
  const normalisedPath = filePath.replace(/\\/g, "/");

  // Only check files under src/ that are TypeScript
  if (!normalisedPath.match(/src\/.*\.tsx?$/)) {
    process.exit(0);
  }

  // Get file content: PostToolUse reads from disk, PreToolUse from tool input
  let fileContent;
  if (isPostToolUse) {
    if (!existsSync(filePath)) {
      process.exit(0);
    }
    fileContent = readFileSync(filePath, "utf-8");
  } else {
    fileContent = toolInput.content ?? toolInput.new_string ?? "";
  }

  if (!fileContent) {
    process.exit(0);
  }

  // Load ownership map
  const ownershipMap = loadOwnershipMap();
  if (!ownershipMap) {
    // No ownership map — no-op
    process.exit(0);
  }

  // Load context map
  const contextMap = loadContextMap();

  // Run boundary check
  const result = checkBoundary(normalisedPath, fileContent, ownershipMap, contextMap);

  if (result.violations.length > 0) {
    const message = formatViolationMessage(normalisedPath, result.violations, result.escapeHatchUsed, isPostToolUse);
    process.stderr.write(message + "\n");
    // PostToolUse: exit 2 triggers continueOnBlock feedback to Claude
    // PreToolUse: exit 1 blocks the tool call
    process.exit(isPostToolUse ? 2 : 1);
  }

  process.exit(0);
}

main();
