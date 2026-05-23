/**
 * T-20~T-23: Bugfix Spec tests — parser, renderer, self-checks.
 *
 * Validates: Requirement 14
 */
import { describe, expect, it } from "vitest";
import {
  parseBugfixDesignMarkdown,
  parseBugfixMarkdown,
  renderBugfixDesignMarkdown,
  renderBugfixMarkdown,
  runBugfixSelfChecks,
} from "../src/spec-bugfix.js";
import type {
  BugfixDesignDocument,
  BugfixDocument,
  EarsClause,
  SpecBundle,
  SpecFileFrontmatter,
} from "../src/spec-bundle.js";

function makeFm(): SpecFileFrontmatter {
  return {
    feature: "test",
    status: "draft",
    date: "2026-05-23",
    workflow_variant: "requirements-first",
    kind: "bugfix",
  };
}

function makeEars(overrides?: Partial<EarsClause>): EarsClause {
  return { line: 1, when: "条件", shall: "行为", raw: "当 条件 时 系统应当 行为", ...overrides };
}

const validBugfixMd = `---
feature: login-bug
status: draft
date: 2026-05-23
workflow_variant: requirements-first
kind: bugfix
---

# Bugfix: Login fails on special characters

## Current Behavior

- 当 用户密码含特殊字符 时 系统应当 返回内部错误

## Expected Behavior

- 当 用户密码含特殊字符 时 系统应当 正常登录

## Unchanged Behavior

- 当 用户密码不含特殊字符 时 系统应当 正常登录
- 当 用户名不存在 时 系统应当 返回用户不存在错误
`;

const validBugfixDesignMd = `---
feature: login-bug
status: draft
date: 2026-05-23
workflow_variant: requirements-first
kind: bugfix
---

# Bugfix Design

## Root Cause Analysis

The password validator doesn't escape regex special characters.

## Fix Strategy

Use a literal string match instead of regex.

## Test Properties

fast-check: for all strings, login succeeds.
`;

// ---------------------------------------------------------------------------
// parseBugfixMarkdown
// ---------------------------------------------------------------------------

describe("parseBugfixMarkdown", () => {
  it("parses complete bugfix.md with three sections", () => {
    const result = parseBugfixMarkdown(validBugfixMd);
    expect(result.errors).toBeUndefined();
    expect(result.doc).toBeDefined();

    const doc = result.doc!;
    expect(doc.current).toHaveLength(1);
    expect(doc.expected).toHaveLength(1);
    expect(doc.unchanged).toHaveLength(2);
    expect(doc.frontmatter.kind).toBe("bugfix");
  });

  it("returns errors for missing sections", () => {
    const md = `---
feature: test
status: draft
date: 2026-05-23
workflow_variant: requirements-first
kind: bugfix
---

# Bugfix

## Current Behavior

- 当 X 时 系统应当 Y
`;
    const result = parseBugfixMarkdown(md);
    expect(result.errors).toBeDefined();
  });

  it("returns errors for empty input", () => {
    const result = parseBugfixMarkdown("");
    expect(result.errors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// parseBugfixDesignMarkdown
// ---------------------------------------------------------------------------

describe("parseBugfixDesignMarkdown", () => {
  it("parses complete bugfix design.md", () => {
    const result = parseBugfixDesignMarkdown(validBugfixDesignMd);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.rootCause).toContain("regex");
    expect(result.doc!.fixStrategy).toContain("literal");
    expect(result.doc!.testProperties).toContain("fast-check");
  });

  it("returns errors for missing sections", () => {
    const md = `---
feature: test
status: draft
date: 2026-05-23
workflow_variant: requirements-first
kind: bugfix
---

# Design

## Root Cause Analysis

Some cause.
`;
    const result = parseBugfixDesignMarkdown(md);
    expect(result.errors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe("bugfix round-trip", () => {
  it("bugfix.md render→parse preserves content", () => {
    const doc: BugfixDocument = {
      frontmatter: { ...makeFm(), kind: "bugfix" } as any,
      current: [makeEars({ when: "X", shall: "fail", raw: "当 X 时 系统应当 fail" })],
      expected: [makeEars({ when: "X", shall: "succeed", raw: "当 X 时 系统应当 succeed" })],
      unchanged: [makeEars({ when: "Y", shall: "work", raw: "当 Y 时 系统应当 work" })],
    };

    const md = renderBugfixMarkdown(doc);
    const result = parseBugfixMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.current).toHaveLength(1);
    expect(result.doc!.expected).toHaveLength(1);
    expect(result.doc!.unchanged).toHaveLength(1);
  });

  it("bugfix design render→parse preserves content", () => {
    const doc: BugfixDesignDocument = {
      frontmatter: { ...makeFm(), kind: "bugfix" } as any,
      rootCause: "Root cause",
      fixStrategy: "Fix strategy",
      testProperties: "PBT strategy",
    };

    const md = renderBugfixDesignMarkdown(doc);
    const result = parseBugfixDesignMarkdown(md);
    expect(result.doc!.rootCause).toBe("Root cause");
  });
});

// ---------------------------------------------------------------------------
// runBugfixSelfChecks (BFX-01~06)
// ---------------------------------------------------------------------------

function makeBugfixBundle(overrides?: Partial<BugfixDocument>): SpecBundle {
  const doc: BugfixDocument = {
    frontmatter: { ...makeFm(), kind: "bugfix" } as any,
    current: [makeEars({ when: "X", shall: "fail", raw: "当 X 时 系统应当 fail" })],
    expected: [makeEars({ when: "X", shall: "succeed", raw: "当 X 时 系统应当 succeed" })],
    unchanged: [makeEars({ when: "Y", shall: "work", raw: "当 Y 时 系统应当 work" })],
    ...overrides,
  };

  return {
    feature: "test",
    kind: "bugfix",
    layout: "three-file",
    variant: "requirements-first",
    primary: doc,
  };
}

describe("runBugfixSelfChecks", () => {
  it("passes with complete bugfix document", () => {
    const bundle = makeBugfixBundle();
    const result = runBugfixSelfChecks(bundle);
    expect(result.pass).toBe(true);
  });

  // BFX-01: three sections must exist
  it("BFX-01: fails P0 when sections missing", () => {
    const bundle = makeBugfixBundle({ current: [], expected: [], unchanged: [] });
    const result = runBugfixSelfChecks(bundle);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.rule === "BFX-01")).toBe(true);
  });

  // BFX-02: sections must not be empty/placeholder
  it("BFX-02: fails P0 when sections have placeholders", () => {
    const bundle = makeBugfixBundle({
      current: [{ line: 1, when: "", shall: "", raw: "TODO" }],
      expected: [{ line: 1, when: "X", shall: "Y", raw: "当 X 时 系统应当 Y" }],
      unchanged: [{ line: 1, when: "Y", shall: "Z", raw: "当 Y 时 系统应当 Z" }],
    });
    const result = runBugfixSelfChecks(bundle);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.rule === "BFX-02")).toBe(true);
  });

  // BFX-03: Current != Expected (verbatim)
  it("BFX-03: fails P0 when Current=Expected verbatim", () => {
    const clause = makeEars({ when: "X", shall: "same", raw: "当 X 时 系统应当 same" });
    const bundle = makeBugfixBundle({
      current: [clause],
      expected: [clause],
      unchanged: [makeEars()],
    });
    const result = runBugfixSelfChecks(bundle);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.rule === "BFX-03")).toBe(true);
  });

  // BFX-04: Unchanged vs Expected conflict
  it("BFX-04: fails P0 when Unchanged conflicts with Expected", () => {
    const bundle = makeBugfixBundle({
      current: [makeEars({ when: "X", shall: "fail" })],
      expected: [makeEars({ when: "X", shall: "succeed" })],
      unchanged: [makeEars({ when: "X", shall: "succeed" })], // Same condition as expected = conflict
    });
    const result = runBugfixSelfChecks(bundle);
    // This is a tricky check — Unchanged with same condition as Expected means
    // the bugfix should change behavior AND keep it unchanged — contradictory
    expect(result.pass).toBe(false);
  });

  // BFX-05: EARS syntax required
  it("BFX-05: reports P1 for non-EARS entries", () => {
    const bundle = makeBugfixBundle({
      current: [{ line: 1, when: "", shall: "", raw: "Non-EARS text" }],
      expected: [makeEars()],
      unchanged: [makeEars()],
    });
    const result = runBugfixSelfChecks(bundle);
    expect(result.findings.some((f) => f.rule === "BFX-05")).toBe(true);
  });

  // BFX-06: At least 1 non-manual Unchanged
  it("BFX-06: reports P1 when all Unchanged are [manual]", () => {
    const bundle = makeBugfixBundle({
      unchanged: [makeEars({ raw: "当 X 时 系统应当 Y [manual]" })],
    });
    const result = runBugfixSelfChecks(bundle);
    expect(result.findings.some((f) => f.rule === "BFX-06")).toBe(true);
  });
});
