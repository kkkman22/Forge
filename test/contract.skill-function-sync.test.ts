/**
 * Contract tests for SKILL.md ↔ TypeScript function sync.
 *
 * Verifies bidirectional consistency between SKILL.md "Function Call"
 * references and actual TypeScript exports:
 *
 * Direction 1: Every registered function exists and is exported from its module
 * Direction 2: Every function reference in SKILL.md has a matching registry entry
 * Direction 3: Every registry entry's declared SKILL references contain the function name
 *
 * **Validates: SKILL-Code Sync Contract**
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SKILL_FUNCTION_REGISTRY } from "../src/skill-function-registry.js";

const ROOT = resolve(import.meta.dirname, "..");
const SKILLS_DIR = resolve(ROOT, "skills");
const SRC_DIR = resolve(ROOT, "src");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all function names referenced via "Function Call" or "call `fn(`"
 * patterns in a SKILL.md file.
 */
function extractFunctionReferences(content: string): string[] {
  const refs: string[] = [];

  const patterns = [
    // **Function Call**: `functionName(` or **Function call**: `functionName(`
    /\*\*Function [Cc]all\*\*:\s*`(\w+)\(/g,
    // **函数调用**：`functionName(` (Chinese variant)
    /\*\*函数调用\*\*：`(\w+)\(/g,
    // call `functionName(` or Call `functionName(` (inline references)
    /[Cc]all `(\w+)\(/g,
    // 调用 `functionName(` (Chinese inline)
    /调用 `(\w+)\(/g,
  ];

  for (const pattern of patterns) {
    for (const m of content.matchAll(pattern)) {
      refs.push(m[1]);
    }
  }

  // Deduplicate
  return [...new Set(refs)];
}

// ---------------------------------------------------------------------------
// Direction 1: Registry → Source code (every registered function exists)
// ---------------------------------------------------------------------------

describe("Direction 1: Registry functions exist in source modules", () => {
  for (const entry of SKILL_FUNCTION_REGISTRY) {
    it(`${entry.functionName} is exported from src/${entry.module}`, async () => {
      const modulePath = resolve(SRC_DIR, entry.module);
      expect(existsSync(modulePath), `Module not found: src/${entry.module}`).toBe(true);

      const content = readFileSync(modulePath, "utf-8");

      // Check that the function is exported (or registered as MCP tool)
      const exportPattern = new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${entry.functionName}\\s*\\(`,
      );
      // Also match re-exports: export { functionName } from "./sub-module.js"
      const reExportPattern = new RegExp(
        `export\\s*\\{[^}]*\\b${entry.functionName}\\b[^}]*\\}\\s*from`,
      );
      const mcpToolPattern = new RegExp(
        `server\\.(?:tool|registerTool)\\s*\\(\\s*["']${entry.functionName}["']`,
      );
      const found = entry.mcpTool
        ? mcpToolPattern.test(content) ||
          exportPattern.test(content) ||
          reExportPattern.test(content)
        : exportPattern.test(content) || reExportPattern.test(content);
      expect(
        found,
        `${entry.functionName} not found as exported function or MCP tool in src/${entry.module}`,
      ).toBe(true);
    });

    it(`${entry.functionName} has expected parameters: [${entry.parameterNames.join(", ")}]`, () => {
      const modulePath = resolve(SRC_DIR, entry.module);
      const content = readFileSync(modulePath, "utf-8");

      // Re-export detection pattern (shared with export-check test above)
      const reExportPattern = new RegExp(
        `export\\s*\\{[^}]*\\b${entry.functionName}\\b[^}]*\\}\\s*from`,
      );

      if (entry.mcpTool) {
        // MCP tools: check parameter names appear in the zod schema object
        const toolPattern = new RegExp(
          `server\\.tool\\s*\\(\\s*["']${entry.functionName}["'][^,]*,\\s*\\{[^\\}]*\\}`,
        );
        const toolMatch = content.match(toolPattern);
        const schemaContent = toolMatch ? toolMatch[0] : content;
        for (const param of entry.parameterNames) {
          expect(
            schemaContent,
            `Parameter "${param}" not found in ${entry.functionName} MCP tool schema`,
          ).toContain(param);
        }
        return;
      }

      // Extract the function signature (from "export [async] function name(" to the closing ")")
      const sigPattern = new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${entry.functionName}\\s*\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\)`,
      );
      const sigMatch = content.match(sigPattern);

      // If the function is re-exported (not defined inline), skip signature check
      // — the sub-module file contains the actual signature
      if (!sigMatch && reExportPattern.test(content)) {
        return;
      }
      expect(
        sigMatch,
        `Could not extract signature for ${entry.functionName} in src/${entry.module}`,
      ).not.toBeNull();

      if (sigMatch) {
        const signature = sigMatch[1];
        for (const param of entry.parameterNames) {
          expect(
            signature,
            `Parameter "${param}" not found in ${entry.functionName} signature`,
          ).toContain(param);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Direction 2: SKILL.md → Registry (every SKILL reference has a registry entry)
// ---------------------------------------------------------------------------

describe("Direction 2: SKILL.md function references have registry entries", () => {
  const libDir = resolve(SKILLS_DIR, "tinkerman", "lib");
  const subDirs = existsSync(libDir)
    ? readdirSync(libDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

  for (const dir of subDirs) {
    const instrPath = resolve(libDir, dir, "instructions.md");
    if (!existsSync(instrPath)) continue;

    const content = readFileSync(instrPath, "utf-8");
    const refs = extractFunctionReferences(content);

    for (const funcName of refs) {
      it(`skills/tinkerman/lib/${dir}/instructions.md → ${funcName} has a registry entry`, () => {
        const entry = SKILL_FUNCTION_REGISTRY.find((e) => e.functionName === funcName);
        expect(
          entry,
          `"${funcName}" referenced in skills/tinkerman/lib/${dir}/instructions.md but missing from SKILL_FUNCTION_REGISTRY. ` +
            `Add an entry to src/skill-function-registry.ts.`,
        ).toBeDefined();
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Direction 3: Registry → SKILL.md (declared SKILL references are accurate)
// ---------------------------------------------------------------------------

describe("Direction 3: Registry SKILL references contain the function name", () => {
  for (const entry of SKILL_FUNCTION_REGISTRY) {
    for (const skill of entry.skills) {
      it(`skills/${skill} references ${entry.functionName}`, () => {
        const skillPath = resolve(SKILLS_DIR, skill);
        expect(existsSync(skillPath), `SKILL file not found: skills/${skill}`).toBe(true);

        // Check both main SKILL.md and references/function-contracts.md
        const skillContent = readFileSync(skillPath, "utf-8");
        const skillDir = skill.replace(/\/(?:SKILL\.md|instructions\.md)$/, "");
        const refPath = resolve(SKILLS_DIR, skillDir, "references", "function-contracts.md");
        const refContent = existsSync(refPath) ? readFileSync(refPath, "utf-8") : "";
        const allContent = skillContent + refContent;

        expect(
          allContent.includes(entry.functionName),
          `${entry.functionName} declared in registry for skills/${skill} but not found in SKILL.md or references/function-contracts.md`,
        ).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Registry integrity checks
// ---------------------------------------------------------------------------

describe("Registry integrity", () => {
  it("has no duplicate function entries", () => {
    const seen = new Set<string>();
    for (const entry of SKILL_FUNCTION_REGISTRY) {
      const key = `${entry.module}::${entry.functionName}`;
      expect(seen.has(key), `Duplicate registry entry: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("all referenced modules exist", () => {
    const modules = new Set(SKILL_FUNCTION_REGISTRY.map((e) => e.module));
    for (const mod of modules) {
      const modPath = resolve(SRC_DIR, mod);
      expect(existsSync(modPath), `Module not found: src/${mod}`).toBe(true);
    }
  });

  it("all referenced SKILL files exist", () => {
    const skills = new Set(SKILL_FUNCTION_REGISTRY.flatMap((e) => e.skills));
    for (const skill of skills) {
      const skillPath = resolve(SKILLS_DIR, skill);
      expect(existsSync(skillPath), `SKILL file not found: skills/${skill}`).toBe(true);
    }
  });

  it("has at least 10 entries (sanity check)", () => {
    expect(SKILL_FUNCTION_REGISTRY.length).toBeGreaterThanOrEqual(10);
  });
});
