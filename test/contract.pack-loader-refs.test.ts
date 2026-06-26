/**
 * Contract tests — Pack loader references in plan docs ↔ src/ exports.
 *
 * Validates the "Pack Data Task Integration Test Requirement" section of
 * `skills/forge/lib/plan/references/atomic-task-format.md`. That section lists,
 * per pack-category, the Core loader function a plan must invoke
 * (e.g. `loadContexts(enabledPacks)`). Every named loader must either:
 *
 *   (a) be exported from `src/` — so the documented contract is real, or
 *   (b) carry an explicit "未实现 / not-yet-implemented" annotation on the same
 *       line — so the doc never silently tells an agent to call a phantom fn.
 *
 * **Validates: Plan-Doc ↔ Core-Loader Sync Contract**
 *
 * Origin: discovered while triaging `src/state-machine/` as an orphan module.
 * `atomic-task-format.md` told plans to call `loadStateMachineDefinitions(enabledPacks)`
 * — a function that has never existed. This test prevents that class of drift.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const DOC = resolve(ROOT, "skills/forge/lib/plan/references/atomic-task-format.md");
const SRC = resolve(ROOT, "src");

/**
 * Each loader line in the "适用判定" list looks like:
 *   `- \`packs/<name>/<category>/\` → 要求 \`loadXxx(enabledPacks)\` 测试`
 * Capture the function name only when it is an un-annotated requirement line.
 * Lines explicitly marked as not-yet-implemented are skipped (see extractLoaderRefs).
 */
interface LoaderRef {
  functionName: string;
  line: string;
  lineNumber: number;
  annotatedUnimplemented: boolean;
}

function extractLoaderRefs(content: string): LoaderRef[] {
  const refs: LoaderRef[] = [];
  const lines = content.split(/\r?\n/);
  // Match: `→ 要求 \`loadXxx(enabledPacks)\` 测试`
  const linePattern = /→\s*要求\s*`(\w+)\([^)]*\)`\s*测试/;
  const unimplementedMarkers = [
    "未实现",
    "待接线",
    "待实现",
    "not-yet-implemented",
    "not implemented",
    "(planned)",
  ];

  lines.forEach((line, idx) => {
    const m = line.match(linePattern);
    if (!m) return;
    const annotatedUnimplemented = unimplementedMarkers.some((marker) =>
      line.toLowerCase().includes(marker.toLowerCase()),
    );
    refs.push({
      functionName: m[1],
      line,
      lineNumber: idx + 1,
      annotatedUnimplemented,
    });
  });
  return refs;
}

/** Recursively read all .ts files under src/, return their concatenated text. */
function readAllSource(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith(".ts")) out.push(readFileSync(full, "utf-8"));
    }
  };
  walk(SRC);
  return out.join("\n");
}

/** A loader is satisfied if it is exported anywhere in src/ (function or re-export). */
function isExported(srcText: string, fn: string): boolean {
  const exportFn = new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\s*\\(`);
  const reExport = new RegExp(`export\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}`);
  return exportFn.test(srcText) || reExport.test(srcText);
}

describe("Contract: plan-doc pack loader refs ↔ src/ exports", () => {
  const docContent = readFileSync(DOC, "utf-8");
  const refs = extractLoaderRefs(docContent);
  const srcText = readAllSource();

  it("the loader-requirement list is non-empty (sanity: parser still works)", () => {
    expect(refs.length, "expected at least one `→ 要求 `loadXxx(...)` 测试` line").toBeGreaterThan(
      0,
    );
  });

  for (const ref of refs) {
    const label = `${ref.functionName} (atomic-task-format.md:${ref.lineNumber})`;
    if (ref.annotatedUnimplemented) {
      it(`${label}: annotated not-yet-implemented — allowed`, () => {
        // Annotated lines are exempt from the export requirement.
        expect(true).toBe(true);
      });
      continue;
    }
    it(`${label}: must be exported from src/ (or marked unimplemented)`, () => {
      expect(
        isExported(srcText, ref.functionName),
        `Doc requires plans to call \`${ref.functionName}(enabledPacks)\` but it is not exported anywhere in src/. ` +
          `Either implement it, or annotate the line as not-yet-implemented (未实现/待接线).\n  Line: ${ref.line.trim()}`,
      ).toBe(true);
    });
  }
});
