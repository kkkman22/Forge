#!/usr/bin/env node

/**
 * postooluse-inject-warnings.mjs — PostToolUse hook for frozen file and
 * context boundary violation warnings (R15).
 *
 * Detects Edit/Write/MultiEdit/NotebookEdit operations on frozen files or
 * files with context boundary violations. Injects Chinese warnings via
 * updatedToolOutput.
 *
 * Input:  JSON from stdin with { tool_name, tool_input, tool_response }
 * Output: JSON with { hookSpecificOutput: { updatedToolOutput } } or nothing
 *
 * Exit codes: 0 (always — PostToolUse never blocks)
 *
 * @see design.md#c4-posttooluse-updatedtooloutput-r15
 * @see ADR-0001-frozen-structured-feedback.md
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { readStdin } from "./lib/read-stdin.mjs";

// ── Constants ──

const STDIN_TIMEOUT_MS = 100;
const STDIN_MAX_BYTES = 262144; // 256KB

// Tools we monitor
const MONITORED_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// ── Helpers ──

// readStdin imported from ./lib/read-stdin.mjs

/**
 * Find the project root by walking up from cwd looking for .tinkerman/config.md.
 */
function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".tinkerman", "config.md"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

/**
 * Read config and check if postooluse_inject_warnings is off.
 */
function isHookDisabled(projectRoot) {
  try {
    const configPath = resolve(projectRoot, ".tinkerman", "config.md");
    if (!existsSync(configPath)) return false;
    const content = readFileSync(configPath, "utf-8");

    // Check env override first
    if (process.env.FORGE_POSTOOLUSE_INJECT_WARNINGS === "off") return true;

    // Check config frontmatter
    const match = content.match(/^postooluse_inject_warnings:\s*(\S+)/m);
    if (match && match[1] === "off") return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Hard-coded default frozen paths (matches zone-registry.sh defaults).
 * Used when config.md has no HARD-GATE block or is missing entirely.
 */
const DEFAULT_FROZEN_PATHS = [
  { glob: "specs/", category: "frozen-spec", qualifier: "locked" },
  { glob: "plans/", category: "frozen-plan", qualifier: "approved" },
  { glob: "config.md", category: "frozen-config", qualifier: null },
];

function parseFrozenPaths(projectRoot) {
  const frozenPaths = [];

  try {
    const configPath = resolve(projectRoot, ".tinkerman", "config.md");
    if (!existsSync(configPath)) return DEFAULT_FROZEN_PATHS;
    const content = readFileSync(configPath, "utf-8");

    // Extract HARD-GATE frozen-zone-protection block
    const gateMatch = content.match(
      /<HARD-GATE\s+name="frozen-zone-protection">([\s\S]*?)<\/HARD-GATE>/,
    );
    if (!gateMatch) return DEFAULT_FROZEN_PATHS;

    const block = gateMatch[1];
    const lines = block.split("\n");

    for (const line of lines) {
      // Match lines like: - `.tinkerman/specs/*/spec.md`（status: locked）
      const globMatch = line.match(/`\.tinkerman\/([^`]+)`/);
      if (!globMatch) continue;

      const rawGlob = globMatch[1];

      // Extract optional status qualifier
      let qualifier = null;
      const qualMatch =
        line.match(/（status:\s*([a-z]+)）/) ||
        line.match(/\(status:\s*([a-z]+)\)/);
      if (qualMatch) {
        qualifier = qualMatch[1];
      }

      // Determine category
      let category;
      if (rawGlob.startsWith("specs/")) {
        category = "frozen-spec";
      } else if (rawGlob.startsWith("plans/")) {
        category = "frozen-plan";
      } else if (rawGlob === "config.md") {
        category = "frozen-config";
      } else {
        category = "frozen-custom";
      }

      frozenPaths.push({ glob: rawGlob, category, qualifier });
    }

    // If block existed but no entries parsed, fall back to defaults
    return frozenPaths.length > 0 ? frozenPaths : DEFAULT_FROZEN_PATHS;
  } catch {
    // Fail open
  }

  return DEFAULT_FROZEN_PATHS;
}

/**
 * Read file status from YAML frontmatter.
 */
function readFileStatus(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").slice(0, 20);

    let inFrontmatter = false;
    for (const line of lines) {
      if (line.trim() === "---") {
        if (inFrontmatter) break;
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        const statusMatch = line.match(/^status:\s*["']?(\w+)["']?/);
        if (statusMatch) return statusMatch[1];
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Check if a file path matches a frozen zone pattern.
 * Returns { isFrozen: boolean, category: string } or null.
 */
function checkFrozenZone(filePath, projectRoot) {
  const resolved = normalisePath(resolve(filePath));
  const projectResolved = normalisePath(resolve(projectRoot));

  if (!resolved.startsWith(projectResolved + "/.tinkerman/")) return null;
  const forgeRelative = resolved.slice(projectResolved.length + 12);
  if (!forgeRelative) return null;

  const frozenPaths = parseFrozenPaths(projectRoot);

  for (const { glob, category, qualifier } of frozenPaths) {
    if (globMatches(forgeRelative, glob)) {
      if (qualifier) {
        const actualStatus = readFileStatus(filePath);
        if (actualStatus !== qualifier) continue;
      }
      return { isFrozen: true, category };
    }
  }

  return null;
}

/**
 * Check if a forge-relative path matches a rule glob.
 * Delegates to globMatches() for consistent wildcard handling.
 */
function pathMatchesRule(forgeRelative, glob) {
  return globMatches(forgeRelative, glob);
}

// ── Context boundary check ──

/**
 * Parse TypeScript import statements from source code.
 */
function parseImports(fileContent) {
  const lines = fileContent.split("\n");
  const results = [];
  const ESCAPE_HATCH_RE = /@forge:allow-cross-context/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(
      /import\s+(?:[\w{},\s*]+\s+from\s+)?["']([^"']+)["']/,
    );
    if (match) {
      const hasEscapeHatch = i > 0 && ESCAPE_HATCH_RE.test(lines[i - 1]);
      results.push({
        module: match[1],
        line: i + 1,
        hasEscapeHatch,
      });
    }
  }

  return results;
}

/**
 * Simple glob matching: supports ** (any depth), * (single segment),
 * and trailing / for directory prefix matching.
 */
function globMatches(filePath, glob) {
  // Trailing / means "any file under this directory"
  if (glob.endsWith("/")) {
    return filePath.startsWith(glob);
  }

  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{DOUBLESTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{DOUBLESTAR}}/g, ".*");

  const re = new RegExp(`^${escaped}$`);
  return re.test(filePath);
}

/**
 * Load ownership map from .tinkerman/context-ownership.yaml.
 */
function loadOwnershipMap(projectRoot) {
  const ownershipPath = resolve(projectRoot, ".tinkerman", "context-ownership.yaml");
  if (!existsSync(ownershipPath)) return null;

  try {
    const content = readFileSync(ownershipPath, "utf-8");
    const map = {};

    const lines = content.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;

      const match = line.match(
        /^["']?([^"':]+?)["']?\s*:\s*["']?([^"']+)["']?\s*$/,
      );
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
 * Load context map from _map.yaml files.
 */
function loadContextMap(projectRoot) {
  const entries = [];

  // Load from custom layer
  const customMapPath = resolve(
    projectRoot,
    ".tinkerman",
    "custom",
    "contexts",
    "_map.yaml",
  );
  if (existsSync(customMapPath)) {
    loadMapYaml(customMapPath, entries);
  }

  return entries;
}

/**
 * Parse a _map.yaml file and push entries into the array.
 */
function loadMapYaml(filePath, entries) {
  try {
    const content = readFileSync(filePath, "utf-8");
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
        });
      }
    }
  } catch {
    // Silently skip
  }
}

const BLOCKED_RELATIONSHIPS = new Set(["customer-supplier", "conformist"]);

/**
 * Find relationship between two contexts in the context map.
 */
function findRelationship(source, target, contextMap) {
  for (const entry of contextMap) {
    if (entry.source === source && entry.target === target) {
      return entry.type;
    }
    if (
      entry.target === source &&
      entry.source === target &&
      (entry.type === "partnership" || entry.type === "shared-kernel")
    ) {
      return entry.type;
    }
  }
  return null;
}

/**
 * Normalise a path: resolve . and .. segments.
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

/**
 * Resolve the context for a file path against ownership map.
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
 * Resolve the context for an imported module path.
 */
function resolveImportContext(importerPath, importPath, ownershipMap) {
  const dir = importerPath.replace(/[^/]*$/, "");
  const resolved = normalisePath(dir + importPath);
  return resolveFileContext(resolved, ownershipMap);
}

/**
 * Check context boundary violations for a file.
 */
function checkContextBoundary(filePath, projectRoot) {
  try {
    const normalized = filePath.replace(/\\/g, "/");

    // Only check TypeScript files under src/
    if (!normalized.match(/src\/.*\.tsx?$/)) return null;

    if (!existsSync(filePath)) return null;
    const fileContent = readFileSync(filePath, "utf-8");
    if (!fileContent) return null;

    const ownershipMap = loadOwnershipMap(projectRoot);
    if (!ownershipMap) return null;

    const contextMap = loadContextMap(projectRoot);

    const sourceContext = resolveFileContext(normalized, ownershipMap);
    if (!sourceContext) return null;

    const imports = parseImports(fileContent);
    const violations = [];

    for (const imp of imports) {
      if (!imp.module.startsWith(".")) continue;
      if (imp.hasEscapeHatch) continue;

      const targetContext = resolveImportContext(
        normalized,
        imp.module,
        ownershipMap,
      );
      if (!targetContext) continue;
      if (targetContext === sourceContext) continue;

      const relationship = findRelationship(sourceContext, targetContext, contextMap);

      if (relationship === null) {
        violations.push({
          sourceContext,
          targetContext,
          line: imp.line,
          type: "undeclared",
        });
      } else if (BLOCKED_RELATIONSHIPS.has(relationship)) {
        violations.push({
          sourceContext,
          targetContext,
          line: imp.line,
          type: relationship,
        });
      }
    }

    if (violations.length > 0) {
      return violations;
    }
  } catch {
    // Fail open
  }

  return null;
}

// ── Main ──

async function main() {
  try {
    // Read stdin
    const buf = await readStdin();
    if (buf.length === 0) {
      process.exit(0);
    }

    let input;
    try {
      input = JSON.parse(buf.toString("utf-8"));
    } catch {
      process.exit(0);
    }

    const toolName = input?.tool_name ?? "";
    const toolInput = input?.tool_input ?? {};
    const toolResponse = input?.tool_response ?? "";

    // Only act on monitored tools
    if (!MONITORED_TOOLS.has(toolName)) {
      process.exit(0);
    }

    // Extract file_path (NotebookEdit uses notebook_path)
    const filePath =
      toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path ?? "";
    if (!filePath) {
      process.exit(0);
    }

    // Determine project root
    const projectRoot = findProjectRoot(process.cwd());

    // Check if hook is disabled
    if (isHookDisabled(projectRoot)) {
      process.exit(0);
    }

    const warnings = [];

    // Check 1: Frozen zone
    const frozenResult = checkFrozenZone(filePath, projectRoot);
    if (frozenResult && frozenResult.isFrozen) {
      const normalizedName = filePath.replace(/\\/g, "/");
      warnings.push(
        `⚠️ Frozen file modified: ${normalizedName}; 见 ADR-0001-frozen-structured-feedback.md`,
      );
    }

    // Check 2: Context boundary violations
    const boundaryViolations = checkContextBoundary(filePath, projectRoot);
    if (boundaryViolations && boundaryViolations.length > 0) {
      for (const v of boundaryViolations) {
        warnings.push(
          `⚠️ 上下文边界违规: ${v.sourceContext} → ${v.targetContext}（第 ${v.line} 行，关系: ${v.type}）`,
        );
      }
    }

    // If no warnings, exit silently
    if (warnings.length === 0) {
      process.exit(0);
    }

    // Output warning-prepended response
    const warningBlock = warnings.join("\n");
    const updatedToolOutput = `${warningBlock}\n\n${toolResponse}`;

    const result = {
      hookSpecificOutput: {
        updatedToolOutput,
      },
    };

    process.stdout.write(JSON.stringify(result));
  } catch {
    // Fail open
    process.exit(0);
  }
}

main();
