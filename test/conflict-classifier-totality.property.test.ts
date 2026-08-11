/**
 * Property test: conflict-classifier totality and normalization.
 *
 * Invariant:
 *   - ∀ path → classify(path) ∈ {frozen, guarded, open, source} [R13.1]
 *   - classify(normalize(p)) === classify(p) [R13.2]
 *
 * **Validates: Requirements R7.1, R13.1, R13.2**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classify, normalizePath } from "../src/conflict-classifier.js";

const VALID_ZONES = new Set(["frozen", "guarded", "open", "source"]);

describe("conflict-classifier totality [R13.1, R7.1]", () => {
  it("classify returns a valid zone for any UTF-8 path (200 iterations)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (path) => {
        const zone = classify(path);
        expect(VALID_ZONES.has(zone)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("classify never throws on any input", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 500 }),
          fc.constantFrom("", "/", "./", "../", ".tinkerman/", ".tinkerman/config.md"),
        ),
        (path) => {
          expect(() => classify(path)).not.toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("conflict-classifier normalization [R13.2]", () => {
  it("classify(normalize(p)) === classify(p) for any path (200 iterations)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (path) => {
        expect(classify(normalizePath(path))).toBe(classify(path));
      }),
      { numRuns: 200 },
    );
  });

  it("normalizePath strips trailing slashes", () => {
    expect(normalizePath("foo/bar/")).toBe("foo/bar");
    expect(normalizePath("foo/bar//")).toBe("foo/bar");
    expect(normalizePath("/")).toBe("");
  });

  it("normalizePath strips leading ./", () => {
    expect(normalizePath("./foo/bar")).toBe("foo/bar");
    expect(normalizePath("././foo")).toBe("foo");
  });

  it("normalizePath is idempotent", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (p) => {
        const n1 = normalizePath(p);
        const n2 = normalizePath(n1);
        expect(n2).toBe(n1);
      }),
    );
  });
});

describe("conflict-classifier zone classification [R7.1]", () => {
  it("classifies .tinkerman/config.md as frozen", () => {
    expect(classify(".tinkerman/config.md")).toBe("frozen");
  });

  it("classifies .tinkerman/specs/*/spec.md as frozen (simplified)", () => {
    expect(classify(".tinkerman/specs/my-feature/spec.md")).toBe("frozen");
  });

  it("classifies .tinkerman/plans/*.md as frozen (simplified)", () => {
    expect(classify(".tinkerman/plans/my-feature.md")).toBe("frozen");
  });

  it("classifies .tinkerman/progress/* as guarded", () => {
    expect(classify(".tinkerman/progress/my-task.md")).toBe("guarded");
  });

  it("classifies .tinkerman/reviews/* as guarded", () => {
    expect(classify(".tinkerman/reviews/my-review.md")).toBe("guarded");
  });

  it("classifies .tinkerman/knowledge/instincts.md as guarded", () => {
    expect(classify(".tinkerman/knowledge/instincts.md")).toBe("guarded");
  });

  it("classifies .tinkerman/decisions/ADR-001.md as guarded", () => {
    expect(classify(".tinkerman/decisions/ADR-001.md")).toBe("guarded");
  });

  it("classifies other .tinkerman/* as open", () => {
    expect(classify(".tinkerman/status.md")).toBe("open");
    expect(classify(".tinkerman/sessions/abc.md")).toBe("open");
  });

  it("classifies non-.forge paths as source", () => {
    expect(classify("src/index.ts")).toBe("source");
    expect(classify("package.json")).toBe("source");
    expect(classify("README.md")).toBe("source");
  });

  it("classifies empty string as source", () => {
    expect(classify("")).toBe("source");
  });
});
