import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { hashCandidates, normalizeInput } from "../src/glossary-hook.js";
import type { GlossaryCheckInput } from "../src/glossary-hook.js";
import type { Glossary } from "../src/glossary.js";

const emptyGlossary: Glossary = { schema_version: 1, updated: "", terms: [] };

describe("glossary-hook property tests", () => {
  it("hashCandidates is commutative", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            term: fc.string({ minLength: 1, maxLength: 20 }),
            context: fc.string({ minLength: 0, maxLength: 40 }),
            frequency: fc.nat({ max: 10 }),
          }),
        ),
        (candidates) => {
          const shuffled = [...candidates];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          expect(hashCandidates(candidates)).toBe(hashCandidates(shuffled));
        },
      ),
    );
  });

  it("hashCandidates returns empty string for empty array", () => {
    expect(hashCandidates([])).toBe("");
  });

  it("normalizeInput with spec_content is deterministic", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (text) => {
          const input: GlossaryCheckInput = {
            phase: "spec",
            mode: "interactive",
            rawInput: { kind: "spec_content", markdown: text },
            glossary: emptyGlossary,
            now: new Date("2026-01-01"),
            alreadyChecked: new Set(),
          };
          const a = normalizeInput(input);
          const b = normalizeInput(input);
          expect(a.map((c) => c.term)).toEqual(b.map((c) => c.term));
        },
      ),
    );
  });

  it("normalizeInput with commit_message is deterministic", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        (text) => {
          const input: GlossaryCheckInput = {
            phase: "build",
            mode: "interactive",
            rawInput: { kind: "commit_message", message: text },
            glossary: emptyGlossary,
            now: new Date("2026-01-01"),
            alreadyChecked: new Set(),
          };
          const a = normalizeInput(input);
          const b = normalizeInput(input);
          expect(a.map((c) => c.term)).toEqual(b.map((c) => c.term));
        },
      ),
    );
  });

  it("hashCandidates is idempotent", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            term: fc.string({ minLength: 1, maxLength: 20 }),
            context: fc.string({ minLength: 0, maxLength: 40 }),
            frequency: fc.nat({ max: 10 }),
          }),
        ),
        (candidates) => {
          const h1 = hashCandidates(candidates);
          const h2 = hashCandidates(candidates);
          expect(h1).toBe(h2);
        },
      ),
    );
  });
});
