/**
 * Tests for forge_read — structured read operations + path validation.
 *
 * P3-3: script mode (execReadScript / validateScript / vm sandbox) and its
 * tests were removed. This file now covers the structured operations that
 * remain (imports / contains / line_count / json_keys) and validatePaths.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runStructuredReadOperation, validatePaths } from "../../src/mcp/tools/forge-read.js";

// ---------------------------------------------------------------------------
// validatePaths — path traversal prevention
// ---------------------------------------------------------------------------

describe("validatePaths", () => {
  it("allows paths within project root", () => {
    expect(validatePaths(["/home/user/project/src/index.ts"], "/home/user/project")).toBeNull();
  });

  it("allows relative paths within project root", () => {
    expect(validatePaths(["src/index.ts"], "/home/user/project")).toBeNull();
  });

  it("rejects absolute paths escaping project root", () => {
    const result = validatePaths(["/etc/passwd"], "/home/user/project");
    expect(result).toMatch(/escapes project root/);
  });

  it("rejects relative paths with .. traversal", () => {
    const result = validatePaths(["../../../etc/passwd"], "/home/user/project");
    expect(result).toMatch(/escapes project root/);
  });

  it("rejects mixed valid and invalid paths", () => {
    const result = validatePaths(["src/a.ts", "/tmp/evil"], "/home/user/project");
    expect(result).toMatch(/escapes project root/);
  });

  it("allows multiple valid paths", () => {
    expect(
      validatePaths(["src/a.ts", "src/b.ts", "test/c.test.ts"], "/home/user/project"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runStructuredReadOperation — the only analysis surface (P3-3)
// ---------------------------------------------------------------------------

describe("runStructuredReadOperation", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "forge-read-struct-"));
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("imports: extracts import/require specifiers", async () => {
    writeFileSync(join(tmpRoot, "a.ts"), 'import { x } from "./b.js";\nconst c = require("c");\n');
    const result = await runStructuredReadOperation(
      { operation: "imports", paths: ["a.ts"] },
      { cwd: tmpRoot },
    );
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed[0].imports).toEqual(expect.arrayContaining(["./b.js", "c"]));
  });

  it("contains: reports whether query present (without echoing content)", async () => {
    writeFileSync(join(tmpRoot, "a.txt"), "hello world\nsecret token here");
    const result = await runStructuredReadOperation(
      { operation: "contains", paths: ["a.txt"], query: "secret" },
      { cwd: tmpRoot },
    );
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed[0].contains).toBe(true);
    // Output must NOT echo the file content (only the boolean).
    expect(result.output).not.toContain("secret token");
  });

  it("line_count: counts lines per file", async () => {
    writeFileSync(join(tmpRoot, "a.txt"), "a\nb\nc\n");
    const result = await runStructuredReadOperation(
      { operation: "line_count", paths: ["a.txt"] },
      { cwd: tmpRoot },
    );
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed[0].lines).toBe(3);
  });

  it("json_keys: lists top-level keys", async () => {
    writeFileSync(join(tmpRoot, "a.json"), '{"zebra":1,"alpha":2,"beta":3}');
    const result = await runStructuredReadOperation(
      { operation: "json_keys", paths: ["a.json"] },
      { cwd: tmpRoot },
    );
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed[0].keys).toEqual(["alpha", "beta", "zebra"]); // sorted
  });

  it("rejects paths escaping project root", async () => {
    const result = await runStructuredReadOperation(
      { operation: "line_count", paths: ["../../../etc/passwd"] },
      { cwd: tmpRoot },
    );
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/escapes project root/);
  });
});
