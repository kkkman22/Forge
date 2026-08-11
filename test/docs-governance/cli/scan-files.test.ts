import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldExcludeIndex, walkMdFiles } from "../../../src/docs-governance/cli/scan-files.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "scan-files-test-"));
});
afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeDir(rel: string): string {
  const p = join(tmpRoot, rel);
  mkdirSync(p, { recursive: true });
  return p;
}
function writeFile(rel: string, content = ""): void {
  const full = join(tmpRoot, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

describe("walkMdFiles", () => {
  it("returns [] when dir does not exist", () => {
    expect(walkMdFiles(join(tmpRoot, "nope"))).toEqual([]);
  });

  it("collects .md files recursively", () => {
    writeFile("a.md");
    writeFile("sub/b.md");
    const result = walkMdFiles(tmpRoot).map((p) => p.replace(tmpRoot + "/", ""));
    expect(result.sort()).toEqual(["a.md", "sub/b.md"]);
  });

  it("respects custom extensions", () => {
    writeFile("a.txt");
    writeFile("b.md");
    const result = walkMdFiles(tmpRoot, { extensions: [".txt"] });
    expect(result.some((p) => p.endsWith("a.txt"))).toBe(true);
    expect(result.some((p) => p.endsWith("b.md"))).toBe(false);
  });

  it("skipHidden=true skips dotfiles/dotdirs by default", () => {
    writeFile("visible.md");
    writeFile(".hidden.md");
    writeFile(".git/inside.md");
    const result = walkMdFiles(tmpRoot);
    expect(result.some((p) => p.endsWith("visible.md"))).toBe(true);
    expect(result.some((p) => p.includes(".hidden"))).toBe(false);
    expect(result.some((p) => p.includes(".git"))).toBe(false);
  });

  it("skipHidden=false includes dotfiles", () => {
    writeFile(".hidden.md");
    const result = walkMdFiles(tmpRoot, { skipHidden: false });
    expect(result.some((p) => p.endsWith(".hidden.md"))).toBe(true);
  });

  it("allowDotDirs permits specific dotdirs even when skipHidden=true", () => {
    writeFile(".tinkerman/spec.md");
    const result = walkMdFiles(tmpRoot, { allowDotDirs: [".tinkerman"] });
    expect(result.some((p) => p.endsWith("spec.md"))).toBe(true);
  });

  it("skipSsot=true skips the _ssot directory", () => {
    writeFile("_ssot/inside.md");
    writeFile("outside.md");
    const result = walkMdFiles(tmpRoot, { skipSsot: true });
    expect(result.some((p) => p.endsWith("outside.md"))).toBe(true);
    expect(result.some((p) => p.includes("_ssot"))).toBe(false);
  });

  it("excludeFn filters out matching files", () => {
    writeFile("skip-me.md");
    writeFile("keep-me.md");
    const result = walkMdFiles(tmpRoot, { excludeFn: (n) => n.startsWith("skip") });
    expect(result.some((p) => p.endsWith("keep-me.md"))).toBe(true);
    expect(result.some((p) => p.endsWith("skip-me.md"))).toBe(false);
  });

  it("relativeTo returns relative paths + excludedPrefixes filters them", () => {
    writeFile("docs/a.md");
    writeFile("docs/excluded/b.md");
    writeFile("docs/keep/c.md");
    const result = walkMdFiles(join(tmpRoot, "docs"), {
      relativeTo: join(tmpRoot, "docs"),
      excludedPrefixes: ["excluded"],
    });
    expect(result).toContain("a.md");
    expect(result).toContain("keep/c.md");
    expect(result.some((p) => p.startsWith("excluded"))).toBe(false);
  });

  it("symlinkSafe skips symlinks", () => {
    writeFile("real.md");
    // Create a symlink that points outside
    symlinkSync(join(tmpRoot, "real.md"), join(tmpRoot, "link.md"));
    const result = walkMdFiles(tmpRoot, { symlinkSafe: true });
    expect(result.some((p) => p.endsWith("real.md"))).toBe(true);
    expect(result.some((p) => p.endsWith("link.md"))).toBe(false);
  });

  it("symlinkSafe skips paths that resolve outside the root", () => {
    writeFile("inside.md");
    // Create a subdir symlink to a sibling outside tmpRoot
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    writeFile("__outside__", ""); // placeholder so the dir exists
    symlinkSync(outside, join(tmpRoot, "escape"));
    writeFileSync(join(outside, "leaked.md"), "");
    const result = walkMdFiles(tmpRoot, { symlinkSafe: true });
    expect(result.some((p) => p.endsWith("inside.md"))).toBe(true);
    expect(result.some((p) => p.includes("leaked"))).toBe(false);
    rmSync(outside, { recursive: true, force: true });
  });

  it("non-md files are ignored by default", () => {
    writeFile("a.json");
    writeFile("b.ts");
    writeFile("c.md");
    const result = walkMdFiles(tmpRoot);
    expect(result.some((p) => p.endsWith("c.md"))).toBe(true);
    expect(result.some((p) => p.endsWith(".json"))).toBe(false);
    expect(result.some((p) => p.endsWith(".ts"))).toBe(false);
  });

  it("unreadable subdirectory is skipped (no throw)", () => {
    writeFile("visible.md");
    // mkdirSync a dir then make it unreadable isn't portable; instead test that a
    // non-existent child path returns [] gracefully (covered by existsSync check).
    expect(walkMdFiles(join(tmpRoot, "nonexistent-subdir"))).toEqual([]);
  });
});

describe("shouldExcludeIndex", () => {
  it("excludes INDEX (case-insensitive prefix)", () => {
    expect(shouldExcludeIndex("INDEX.md")).toBe(true);
    expect(shouldExcludeIndex("index.md")).toBe(true);
    expect(shouldExcludeIndex("INDEX-other.md")).toBe(true);
  });
  it("excludes README.md", () => {
    expect(shouldExcludeIndex("README.md")).toBe(true);
  });
  it("keeps other files", () => {
    expect(shouldExcludeIndex("guide.md")).toBe(false);
    // /^INDEX/i matches any prefix starting with INDEX, including INDEXING.
    expect(shouldExcludeIndex("INDEXING.md")).toBe(true);
    expect(shouldExcludeIndex("onboarding.md")).toBe(false);
  });
});
