import { mkdirSync, rmSync } from "node:fs";
import { join, join as pathJoin } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendContextEntry } from "../src/context-injection.js";
import { parsePlanContextFiles, resolveContextFiles } from "../src/context-injection-wiring.js";
const TMP = pathJoin(process.cwd(), ".tmp-context-injection-test");
beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
});
describe("parsePlanContextFiles (plan frontmatter consumer)", () => {
    it("extracts context_files from plan frontmatter", () => {
        const planContent = `---
status: approved
context_files:
  - .forge/specs/auth/requirements.md
  - .forge/specs/auth/design.md
---
# Plan body`;
        expect(parsePlanContextFiles(planContent)).toEqual([
            ".forge/specs/auth/requirements.md",
            ".forge/specs/auth/design.md",
        ]);
    });
    it("returns empty array when context_files is absent", () => {
        const planContent = `---
status: approved
---
# Plan body`;
        expect(parsePlanContextFiles(planContent)).toEqual([]);
    });
    it("returns empty array when plan has no frontmatter", () => {
        expect(parsePlanContextFiles("# just a heading")).toEqual([]);
    });
    it("tolerates inline-flow context_files", () => {
        const planContent = `---
status: approved
context_files: [".forge/specs/a.md", ".forge/specs/b.md"]
---
body`;
        expect(parsePlanContextFiles(planContent)).toEqual([".forge/specs/a.md", ".forge/specs/b.md"]);
    });
});
describe("resolveContextFiles (merge plan + jsonl)", () => {
    it("merges plan context_files with runtime context.jsonl, deduped", () => {
        const jsonlPath = join(TMP, "context.jsonl");
        appendContextEntry(jsonlPath, {
            file: ".forge/specs/auth/research.md",
            reason: "runtime discovery",
            task: "auth",
        });
        appendContextEntry(jsonlPath, {
            file: ".forge/specs/auth/requirements.md", // dup with plan
            reason: "also referenced",
            task: "auth",
        });
        const result = resolveContextFiles([".forge/specs/auth/requirements.md", ".forge/specs/auth/design.md"], jsonlPath);
        // plan entries first, then non-dup jsonl entries
        expect(result).toEqual([
            ".forge/specs/auth/requirements.md",
            ".forge/specs/auth/design.md",
            ".forge/specs/auth/research.md",
        ]);
    });
    it("returns plan files only when jsonl does not exist", () => {
        const result = resolveContextFiles(["a.md", "b.md"], join(TMP, "missing.jsonl"));
        expect(result).toEqual(["a.md", "b.md"]);
    });
    it("returns empty array when both sources are empty", () => {
        const result = resolveContextFiles([], join(TMP, "missing.jsonl"));
        expect(result).toEqual([]);
    });
    it("returns jsonl files when plan has none", () => {
        const jsonlPath = join(TMP, "context.jsonl");
        appendContextEntry(jsonlPath, { file: "x.md", reason: "r", task: "t" });
        const result = resolveContextFiles([], jsonlPath);
        expect(result).toEqual(["x.md"]);
    });
});
//# sourceMappingURL=context-injection-wiring.test.js.map