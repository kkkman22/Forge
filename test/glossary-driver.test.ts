/**
 * Tests for the glossary driver (`src/glossary-driver.ts`).
 *
 * Covers:
 *   - Integration: on an empty in-memory filesystem, the first call
 *     produces `.tinkerman/glossary.md` containing all 12 preset terms.
 *   - Existing file is parsed and returned untouched (no overwrite).
 *
 * **Validates: Requirements 1.3, 1.10**
 */

import { describe, expect, it } from "vitest";
import { parseGlossary, renderGlossary } from "../src/glossary.js";
import {
  DEFAULT_GLOSSARY_PATH,
  ensureGlossaryExists,
  type GlossaryFs,
  INITIAL_GLOSSARY_TERMS,
} from "../src/glossary-driver.js";

// ---------------------------------------------------------------------------
// In-memory filesystem adapter
// ---------------------------------------------------------------------------

interface FakeFs extends GlossaryFs {
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

const FIXED_NOW = new Date("2026-05-05T12:34:56Z");

// ---------------------------------------------------------------------------
// Integration: lazy creation on empty fs
// ---------------------------------------------------------------------------

describe("ensureGlossaryExists — lazy creation", () => {
  it("creates glossary.md with 12 preset terms on an empty filesystem", () => {
    const fs = createFakeFs();

    const glossary = ensureGlossaryExists(fs, { now: FIXED_NOW });

    // File was written exactly once at the default path
    expect(fs.writes).toEqual([DEFAULT_GLOSSARY_PATH]);
    expect(fs.store.has(DEFAULT_GLOSSARY_PATH)).toBe(true);

    // Returned glossary exposes all 12 preset terms in order
    expect(glossary.terms).toHaveLength(12);
    expect(glossary.terms.map((t) => t.term)).toEqual([
      "Tier",
      "Spec",
      "Plan",
      "Hint",
      "Subagent",
      "Frozen Zone",
      "Guarded Zone",
      "Open Zone",
      "Restatement Checkpoint",
      "Three-Strike",
      "Closure-First Probe",
      "Vertical Slice",
    ]);

    // Timestamps were stamped from the injected `now`
    expect(glossary.updated).toBe("2026-05-05");
    for (const term of glossary.terms) {
      expect(term.last_updated).toBe("2026-05-05");
    }

    // Written content is the canonical render of the seed
    const written = fs.store.get(DEFAULT_GLOSSARY_PATH);
    expect(written).toBeDefined();
    expect(written).toBe(renderGlossary(glossary));
  });

  it("honours a custom path when supplied", () => {
    const fs = createFakeFs();
    const customPath = "/tmp/sandbox/glossary.md";

    const glossary = ensureGlossaryExists(fs, { path: customPath, now: FIXED_NOW });

    expect(fs.writes).toEqual([customPath]);
    expect(fs.store.has(customPath)).toBe(true);
    expect(fs.store.has(DEFAULT_GLOSSARY_PATH)).toBe(false);
    expect(glossary.terms).toHaveLength(12);
  });

  it("seeds the Tier entry with the documented aliases", () => {
    const fs = createFakeFs();

    const glossary = ensureGlossaryExists(fs, { now: FIXED_NOW });

    const tier = glossary.terms.find((t) => t.term === "Tier");
    expect(tier).toBeDefined();
    expect(tier?.aliases).toEqual(["档位", "复杂度档位"]);
  });

  it("exposes the preset constant with exactly 12 terms", () => {
    // Guards against accidental drift between the constant and the
    // integration expectation above.
    expect(INITIAL_GLOSSARY_TERMS).toHaveLength(12);
  });

  it("produces a file that round-trips through parseGlossary", () => {
    const fs = createFakeFs();
    ensureGlossaryExists(fs, { now: FIXED_NOW });

    const written = fs.store.get(DEFAULT_GLOSSARY_PATH) ?? "";
    const reparsed = parseGlossary(written);

    expect(reparsed.terms).toHaveLength(12);
    expect(reparsed.updated).toBe("2026-05-05");
  });
});

// ---------------------------------------------------------------------------
// Preservation: existing file is parsed, not overwritten
// ---------------------------------------------------------------------------

describe("ensureGlossaryExists — existing file", () => {
  it("parses and returns the existing glossary without writing", () => {
    const existing = [
      "---",
      "schema_version: 1",
      'updated: "2026-01-01"',
      "---",
      "",
      "# Forge Glossary",
      "",
      "## Custom Term",
      "**定义**: 用户自定义的术语。",
      "**更新**: 2026-01-01",
      "",
    ].join("\n");

    const fs = createFakeFs({ [DEFAULT_GLOSSARY_PATH]: existing });

    const glossary = ensureGlossaryExists(fs, { now: FIXED_NOW });

    // No write happened: the existing file is untouched.
    expect(fs.writes).toEqual([]);
    expect(fs.store.get(DEFAULT_GLOSSARY_PATH)).toBe(existing);

    // Returned glossary reflects only the existing content (not the seed).
    expect(glossary.terms).toHaveLength(1);
    expect(glossary.terms[0]?.term).toBe("Custom Term");
    expect(glossary.updated).toBe("2026-01-01");
  });

  it("is idempotent: second call after lazy seed does not re-write", () => {
    const fs = createFakeFs();

    ensureGlossaryExists(fs, { now: FIXED_NOW });
    const writesAfterFirst = [...fs.writes];

    const secondCall = ensureGlossaryExists(fs, { now: FIXED_NOW });

    // Only the initial seed write happened.
    expect(fs.writes).toEqual(writesAfterFirst);
    expect(secondCall.terms).toHaveLength(12);
  });
});
