/**
 * Integration tests for the inline decision note machinery in
 * `src/decide.ts`.
 *
 * Covers three cooperating pieces introduced for Requirement 2.9:
 *
 *   - `renderInlineDecisionNote`    — pure renderer that produces the
 *                                     `<!-- decision: ... | reason: ... -->`
 *                                     one-liner and escapes any `-->`
 *                                     sequences inside the content so
 *                                     the comment cannot terminate
 *                                     prematurely
 *   - `resolveUpstreamFile`         — pure priority picker that routes
 *                                     an inline note to the right
 *                                     upstream document (progress >
 *                                     plan > spec > null)
 *   - `appendInlineNote`            — IO-bearing driver that appends
 *                                     the rendered note to a file via
 *                                     a minimal `InlineNoteAppender`
 *                                     interface, preserving prior
 *                                     content and inserting a blank
 *                                     line separator when needed
 *
 * All filesystem access is faked with an in-memory `Map` so the test
 * stays deterministic and sandbox-friendly.
 *
 * **Validates: Requirements 2.9**
 */

import { describe, expect, it } from "vitest";
import type { AdrCriteriaResult, DecisionCandidate } from "../src/adr-criteria.js";
import {
  appendInlineNote,
  type InlineNoteAppender,
  renderInlineDecisionNote,
  resolveUpstreamFile,
  type StatusFileContext,
} from "../src/decide.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseDecision: DecisionCandidate = {
  title: "Use in-memory fake fs for tests",
  context: "Fake fs keeps test runs deterministic.",
  decision: "Inject a small Map-backed adapter everywhere IO is needed.",
  consequences: "Tests stay fast and never touch real disk.",
  alternatives: ["Use node:fs with tmpdir", "Mock via vi.mock"],
};

const inlineResult: AdrCriteriaResult = {
  reversibility: "hard",
  surprising: false,
  tradeOff: false,
  alternatives: ["Use node:fs with tmpdir", "Mock via vi.mock"],
  shouldBecomeAdr: false,
  verdict: "INLINE_NOTE",
  reasoning: "Partial criteria met (hard to reverse) → inline note in upstream file",
};

// ---------------------------------------------------------------------------
// In-memory filesystem adapter
// ---------------------------------------------------------------------------

interface FakeFs extends InlineNoteAppender {
  readonly store: Map<string, string>;
  readonly writes: string[];
}

function createFakeFs(initial: Record<string, string> = {}): FakeFs {
  const store = new Map<string, string>(Object.entries(initial));
  const writes: string[] = [];
  return {
    store,
    writes,
    exists: (p) => store.has(p),
    readFile: (p) => {
      const content = store.get(p);
      if (content === undefined) {
        throw new Error(`readFile: ${p} does not exist`);
      }
      return content;
    },
    writeFile: (p, content) => {
      store.set(p, content);
      writes.push(p);
    },
  };
}

// ---------------------------------------------------------------------------
// renderInlineDecisionNote
// ---------------------------------------------------------------------------

describe("renderInlineDecisionNote", () => {
  it("produces the documented `<!-- decision: … | reason: … -->` shape", () => {
    const note = renderInlineDecisionNote(baseDecision, inlineResult);

    expect(note).toBe(
      "<!-- decision: Use in-memory fake fs for tests | reason: Partial criteria met (hard to reverse) → inline note in upstream file -->",
    );
  });

  it("escapes `-->` in the decision title so the comment cannot terminate early", () => {
    const decision: DecisionCandidate = {
      ...baseDecision,
      title: "Block `-->` injection in notes",
    };

    const note = renderInlineDecisionNote(decision, inlineResult);

    // The escaped form replaces the raw terminator with `--&gt;` so the
    // only `-->` left in the rendered string is the final one that
    // closes the HTML comment itself.
    const terminatorMatchesTitle = note.match(/-->/g) ?? [];
    expect(terminatorMatchesTitle).toHaveLength(1);
    expect(note).toContain("--&gt;");
    expect(note.endsWith("-->")).toBe(true);

    // The rest of the title is preserved verbatim around the escape.
    expect(note).toContain("Block `--&gt;` injection in notes");
  });

  it("escapes `-->` inside the criteria reasoning text", () => {
    const result: AdrCriteriaResult = {
      ...inlineResult,
      reasoning: "Pipeline breakage risk: raw --> in prose",
    };

    const note = renderInlineDecisionNote(baseDecision, result);

    // Only one terminator remains (the closing one). The embedded
    // `-->` in the reasoning was rewritten to `--&gt;`.
    const terminatorMatches = note.match(/-->/g) ?? [];
    expect(terminatorMatches).toHaveLength(1);
    expect(note).toContain("raw --&gt; in prose");
  });
});

// ---------------------------------------------------------------------------
// resolveUpstreamFile
// ---------------------------------------------------------------------------

describe("resolveUpstreamFile", () => {
  it("prefers progressPath over planPath and specPath", () => {
    const status: StatusFileContext = {
      currentTask: "2.4 inline note",
      specPath: ".kiro/specs/feature-x/spec.md",
      planPath: ".tinkerman/plans/feature-x.md",
      progressPath: ".tinkerman/progress/feature-x.md",
    };

    expect(resolveUpstreamFile(status)).toBe(".tinkerman/progress/feature-x.md");
  });

  it("falls back to planPath when progress is missing", () => {
    const status: StatusFileContext = {
      specPath: ".kiro/specs/feature-x/spec.md",
      planPath: ".tinkerman/plans/feature-x.md",
    };

    expect(resolveUpstreamFile(status)).toBe(".tinkerman/plans/feature-x.md");
  });

  it("falls back to specPath when progress and plan are missing", () => {
    const status: StatusFileContext = {
      specPath: ".kiro/specs/feature-x/spec.md",
    };

    expect(resolveUpstreamFile(status)).toBe(".kiro/specs/feature-x/spec.md");
  });

  it("returns null when no upstream paths are known", () => {
    expect(resolveUpstreamFile({})).toBeNull();
    expect(resolveUpstreamFile({ currentTask: "orphan" })).toBeNull();
  });

  it("treats empty strings as absent so callers can pass raw frontmatter fields", () => {
    const status: StatusFileContext = {
      specPath: "",
      planPath: "",
      progressPath: "",
    };

    expect(resolveUpstreamFile(status)).toBeNull();
  });

  it("skips empty progressPath but still honours a populated planPath", () => {
    const status: StatusFileContext = {
      progressPath: "",
      planPath: ".tinkerman/plans/feature-x.md",
      specPath: ".kiro/specs/feature-x/spec.md",
    };

    expect(resolveUpstreamFile(status)).toBe(".tinkerman/plans/feature-x.md");
  });
});

// ---------------------------------------------------------------------------
// appendInlineNote
// ---------------------------------------------------------------------------

describe("appendInlineNote", () => {
  const note = renderInlineDecisionNote(baseDecision, inlineResult);

  it("creates the file with just the note when it does not exist yet", () => {
    const fs = createFakeFs();
    const path = ".tinkerman/progress/feature-x.md";

    appendInlineNote(fs, path, note);

    expect(fs.writes).toEqual([path]);
    expect(fs.store.get(path)).toBe(`${note}\n`);
  });

  it("appends to an existing file and preserves prior content", () => {
    const path = ".tinkerman/progress/feature-x.md";
    const existing = "# Progress\n\n- Step 1\n- Step 2\n";
    const fs = createFakeFs({ [path]: existing });

    appendInlineNote(fs, path, note);

    const result = fs.store.get(path);
    expect(result).toBeDefined();
    // Prior content is preserved verbatim at the start.
    expect(result?.startsWith(existing)).toBe(true);
    // The note is at the end on its own line.
    expect(result?.endsWith(`${note}\n`)).toBe(true);
    // A blank line separates the prior content from the note.
    expect(result).toContain(`\n\n${note}\n`);
  });

  it("does not insert an extra blank line when the file already ends with one", () => {
    const path = ".tinkerman/plans/feature-x.md";
    const existing = "# Plan\n\n- Task A\n\n";
    const fs = createFakeFs({ [path]: existing });

    appendInlineNote(fs, path, note);

    // The trailing `\n\n` already satisfies the blank-line separator,
    // so the new content is simply `existing + note + \n`.
    expect(fs.store.get(path)).toBe(`${existing}${note}\n`);
  });

  it("adds two newlines when the prior content has no trailing newline at all", () => {
    const path = ".kiro/specs/feature-x/spec.md";
    const existing = "# Spec body without trailing newline";
    const fs = createFakeFs({ [path]: existing });

    appendInlineNote(fs, path, note);

    expect(fs.store.get(path)).toBe(`${existing}\n\n${note}\n`);
  });

  it("is idempotent in shape: two calls leave two notes with exactly one blank line between them", () => {
    const path = ".tinkerman/progress/feature-x.md";
    const fs = createFakeFs({ [path]: "# Progress\n" });

    appendInlineNote(fs, path, note);
    appendInlineNote(fs, path, note);

    const result = fs.store.get(path) ?? "";
    const occurrences = result.split(note).length - 1;
    expect(occurrences).toBe(2);
    // Two writes happened, in order.
    expect(fs.writes).toEqual([path, path]);
    // The final content still ends with a single trailing newline.
    expect(result.endsWith(`${note}\n`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: resolveUpstreamFile + renderInlineDecisionNote + appendInlineNote
// ---------------------------------------------------------------------------

describe("inline note pipeline — end to end", () => {
  it("writes the rendered note into the resolved upstream file", () => {
    const fs = createFakeFs({
      ".tinkerman/progress/feature-x.md": "# Progress\n\n- Step 1\n",
    });
    const status: StatusFileContext = {
      currentTask: "2.4 inline note",
      specPath: ".kiro/specs/feature-x/spec.md",
      planPath: ".tinkerman/plans/feature-x.md",
      progressPath: ".tinkerman/progress/feature-x.md",
    };

    const upstream = resolveUpstreamFile(status);
    expect(upstream).toBe(".tinkerman/progress/feature-x.md");

    const rendered = renderInlineDecisionNote(baseDecision, inlineResult);
    if (upstream !== null) {
      appendInlineNote(fs, upstream, rendered);
    }

    const result = fs.store.get(".tinkerman/progress/feature-x.md") ?? "";
    expect(result).toContain("# Progress");
    expect(result).toContain("- Step 1");
    expect(result).toContain(rendered);
    // The note was appended, not prepended.
    expect(result.indexOf("- Step 1")).toBeLessThan(result.indexOf(rendered));
    // Spec and plan were left untouched.
    expect(fs.store.has(".kiro/specs/feature-x/spec.md")).toBe(false);
    expect(fs.store.has(".tinkerman/plans/feature-x.md")).toBe(false);
  });
});
