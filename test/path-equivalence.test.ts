/**
 * Unit tests for src/path-equivalence.ts — Path canonicalizer & Bash extractor.
 *
 * Validates Requirements 5.1, 5.2, 5.5, 5.6, 5.7.
 */
import { describe, expect, it } from "vitest";

const OPTS = { cwd: "/project", homeDir: "/Users/x" };

describe("extractPathExpressionsFromBash", () => {
  it("extracts tilde path from 'cat ~/file.txt'", async () => {
    const { extractPathExpressionsFromBash } = await import("../src/path-equivalence.js");
    const paths = extractPathExpressionsFromBash("cat ~/file.txt");
    expect(paths).toContainEqual(expect.stringContaining("~/file.txt"));
  });

  it("extracts $HOME path from double-quoted string", async () => {
    const { extractPathExpressionsFromBash } = await import("../src/path-equivalence.js");
    const paths = extractPathExpressionsFromBash('echo "$HOME/.forge/config.md"');
    expect(paths).toContainEqual(expect.stringContaining("$HOME/.forge/config.md"));
  });

  it("extracts literal path from subshell without executing", async () => {
    const { extractPathExpressionsFromBash } = await import("../src/path-equivalence.js");
    const paths = extractPathExpressionsFromBash("$(echo ~/.forge/config.md)");
    expect(paths.some((p) => p.includes(".forge/config.md"))).toBe(true);
  });

  it("extracts backtick paths", async () => {
    const { extractPathExpressionsFromBash } = await import("../src/path-equivalence.js");
    const paths = extractPathExpressionsFromBash("echo `cat ~/.forge/config.md`");
    expect(paths.some((p) => p.includes(".forge/config.md"))).toBe(true);
  });

  it("returns empty array for commands with no paths", async () => {
    const { extractPathExpressionsFromBash } = await import("../src/path-equivalence.js");
    const paths = extractPathExpressionsFromBash("echo hello world");
    expect(paths).toEqual([]);
  });
});

describe("canonicalizePathExpression", () => {
  it("~/.forge/config.md normalizes with homeDir", async () => {
    const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
    const result = canonicalizePathExpression("~/.forge/config.md", OPTS);
    expect(result.normalized).toBe("/Users/x/.forge/config.md");
    expect(result.highRiskUnresolved).toBe(false);
  });

  it("$HOME/.forge/config.md normalizes with homeDir", async () => {
    const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
    const result = canonicalizePathExpression("$HOME/.forge/config.md", OPTS);
    expect(result.normalized).toBe("/Users/x/.forge/config.md");
  });

  it("${HOME}/.forge/config.md normalizes with homeDir", async () => {
    const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
    const result = canonicalizePathExpression("${HOME}/.forge/config.md", OPTS);
    expect(result.normalized).toBe("/Users/x/.forge/config.md");
  });

  it("relative path with .. resolves against cwd", async () => {
    const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
    const result = canonicalizePathExpression("../sibling/file.txt", OPTS);
    expect(result.normalized).toBe("/sibling/file.txt");
  });

  it("high-risk frozen-zone path that cannot be resolved → highRiskUnresolved true", async () => {
    const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
    // Quoted path with unknown variable + frozen-zone signal
    const result = canonicalizePathExpression("'$UNKNOWN/.forge/config.md'", OPTS);
    expect(result.highRiskUnresolved).toBe(true);
  });

  it("raw is preserved", async () => {
    const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
    const result = canonicalizePathExpression("~/.forge/config.md", OPTS);
    expect(result.raw).toBe("~/.forge/config.md");
  });
});

describe("pathsEquivalent", () => {
  it("same normalized paths → equivalent", async () => {
    const { canonicalizePathExpression, pathsEquivalent } = await import(
      "../src/path-equivalence.js"
    );
    const a = canonicalizePathExpression("~/.forge/config.md", OPTS);
    const b = canonicalizePathExpression("/Users/x/.forge/config.md", OPTS);
    expect(pathsEquivalent(a, b)).toBe(true);
  });

  it("different paths → not equivalent", async () => {
    const { canonicalizePathExpression, pathsEquivalent } = await import(
      "../src/path-equivalence.js"
    );
    const a = canonicalizePathExpression("/foo/bar", OPTS);
    const b = canonicalizePathExpression("/baz/qux", OPTS);
    expect(pathsEquivalent(a, b)).toBe(false);
  });
});
