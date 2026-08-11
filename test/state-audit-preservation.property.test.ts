/**
 * Preservation Property Tests: Existing Protection Zone Behavior Unchanged
 *
 * Property 2 (Preservation): These tests capture the existing correct behavior
 * of `checkWritePermission()`, `getProtectionZone()`, and `extractFrontmatterStatus()`
 * that must NOT regress when the guarded zone fix is applied.
 *
 * Key insight: The CURRENT behavior for frozen zone and open zone is already correct.
 * Only guarded zone behavior needs fixing (separate bug condition test).
 *
 * These tests are written BEFORE the fix and MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.1, 3.3, 3.4, 3.9, 3.10**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkWritePermission, extractFrontmatterStatus, getProtectionZone } from "../src/state.js";

// ---------------------------------------------------------------------------
// Generators (reused patterns from state-protection.property.test.ts)
// ---------------------------------------------------------------------------

const topicArb: fc.Arbitrary<string> = fc
  .string({ minLength: 3, maxLength: 20 })
  .map((s) => s.replace(/[^a-z0-9-]/gi, "a").toLowerCase())
  .filter((s) => s.length >= 3 && /^[a-z]/.test(s));

/** Paths that fall in the frozen zone. */
const frozenPathArb: fc.Arbitrary<string> = fc.oneof(
  topicArb.map((t) => `specs/${t}/spec.md`),
  topicArb.map((t) => `plans/${t}.md`),
  fc.constant("config.md"),
);

/** Paths that fall in the guarded zone. */
const guardedPathArb: fc.Arbitrary<string> = fc.oneof(
  topicArb.map((t) => `progress/${t}.md`),
  topicArb.map((t) => `reviews/${t}.md`),
  fc.constant("knowledge/instincts.md"),
  fc.constant("knowledge/known-failures.md"),
  topicArb.map((t) => `knowledge/solutions/${t}.md`),
);

/** Paths that fall in the open zone. */
const openPathArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant("status.md"),
  topicArb.map((t) => `decisions/${t}.md`),
  topicArb.map((t) => `findings/${t}.md`),
  topicArb.map((t) => `debug/${t}.md`),
  topicArb.map((t) => `knowledge/sessions/${t}.md`),
);

/** Content with a specific status in frontmatter. */
function contentWithStatus(status: string): string {
  return `---\nfeature: "test"\nstatus: "${status}"\ndate: "2025-01-15"\n---\n\n# Content\n`;
}

/** Content without a status field. */
const contentWithoutStatus = '---\nfeature: "test"\ndate: "2025-01-15"\n---\n\n# Content\n';

/** Content without any frontmatter. */
const contentWithoutFrontmatter = "# Just a heading\n\nSome content here.\n";

/** Arbitrary status values that trigger blocking in frozen zone. */
const blockingStatusArb: fc.Arbitrary<string> = fc.constantFrom("locked", "approved");

/** Arbitrary status values that do NOT trigger blocking. */
const nonBlockingStatusArb: fc.Arbitrary<string> = fc.constantFrom("draft", "in_progress", "new");

/** Arbitrary status values (any). */
const anyStatusArb: fc.Arbitrary<string> = fc.constantFrom(
  "draft",
  "locked",
  "approved",
  "in_progress",
  "new",
);

// ---------------------------------------------------------------------------
// Preservation: Frozen zone + locked/approved → blocked with reason
// (Validates: Requirements 3.1, 3.10)
// ---------------------------------------------------------------------------

describe("Preservation: Frozen zone write permission behavior", () => {
  it("frozen zone + locked/approved status → { blocked: true } with reason containing '写入被阻断'", () => {
    fc.assert(
      fc.property(frozenPathArb, blockingStatusArb, (path, status) => {
        const result = checkWritePermission(path, contentWithStatus(status));
        expect(result.blocked).toBe(true);
        expect(result.reason).toContain("写入被阻断");
        expect(result.reason).toContain(path);
        expect(result.reason).toContain(status);
      }),
      { numRuns: 40 },
    );
  });

  it("frozen zone + draft/other status → { blocked: false, reason: '' }", () => {
    fc.assert(
      fc.property(frozenPathArb, nonBlockingStatusArb, (path, status) => {
        const result = checkWritePermission(path, contentWithStatus(status));
        expect(result.blocked).toBe(false);
        expect(result.reason).toBe("");
      }),
      { numRuns: 40 },
    );
  });

  it("frozen zone + no status field → { blocked: false, reason: '' }", () => {
    fc.assert(
      fc.property(frozenPathArb, (path) => {
        const result = checkWritePermission(path, contentWithoutStatus);
        expect(result.blocked).toBe(false);
        expect(result.reason).toBe("");
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation: Open zone + any status → not blocked
// (Validates: Requirements 3.4)
// ---------------------------------------------------------------------------

describe("Preservation: Open zone write permission behavior", () => {
  it("open zone + any status → { blocked: false, reason: '' }", () => {
    fc.assert(
      fc.property(openPathArb, anyStatusArb, (path, status) => {
        const result = checkWritePermission(path, contentWithStatus(status));
        expect(result.blocked).toBe(false);
        expect(result.reason).toBe("");
      }),
      { numRuns: 40 },
    );
  });

  it("open zone + no status → { blocked: false, reason: '' }", () => {
    fc.assert(
      fc.property(openPathArb, (path) => {
        const result = checkWritePermission(path, contentWithoutStatus);
        expect(result.blocked).toBe(false);
        expect(result.reason).toBe("");
      }),
      { numRuns: 40 },
    );
  });

  it("open zone + no frontmatter → { blocked: false, reason: '' }", () => {
    fc.assert(
      fc.property(openPathArb, (path) => {
        const result = checkWritePermission(path, contentWithoutFrontmatter);
        expect(result.blocked).toBe(false);
        expect(result.reason).toBe("");
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation: getProtectionZone() correctly classifies all known patterns
// (Validates: Requirements 3.9)
// ---------------------------------------------------------------------------

describe("Preservation: getProtectionZone() classification", () => {
  it("frozen zone paths are classified as 'frozen'", () => {
    fc.assert(
      fc.property(frozenPathArb, (path) => {
        expect(getProtectionZone(path)).toBe("frozen");
      }),
      { numRuns: 40 },
    );
  });

  it("guarded zone paths are classified as 'guarded'", () => {
    fc.assert(
      fc.property(guardedPathArb, (path) => {
        expect(getProtectionZone(path)).toBe("guarded");
      }),
      { numRuns: 40 },
    );
  });

  it("open zone paths are classified as 'open'", () => {
    fc.assert(
      fc.property(openPathArb, (path) => {
        expect(getProtectionZone(path)).toBe("open");
      }),
      { numRuns: 40 },
    );
  });

  it(".tinkerman/ prefix is stripped before classification", () => {
    fc.assert(
      fc.property(frozenPathArb, (path) => {
        expect(getProtectionZone(`.tinkerman/${path}`)).toBe("frozen");
      }),
      { numRuns: 50 },
    );
  });

  it("known frozen patterns: specs/, plans/, config.md", () => {
    expect(getProtectionZone("specs/feature/spec.md")).toBe("frozen");
    expect(getProtectionZone("plans/topic.md")).toBe("frozen");
    expect(getProtectionZone("config.md")).toBe("frozen");
  });

  it("known guarded patterns: progress/, reviews/, knowledge/instincts.md, knowledge/known-failures.md, knowledge/solutions/", () => {
    expect(getProtectionZone("progress/topic.md")).toBe("guarded");
    expect(getProtectionZone("reviews/topic.md")).toBe("guarded");
    expect(getProtectionZone("knowledge/instincts.md")).toBe("guarded");
    expect(getProtectionZone("knowledge/known-failures.md")).toBe("guarded");
    expect(getProtectionZone("knowledge/solutions/topic.md")).toBe("guarded");
  });

  it("known open patterns: status.md, decisions/, findings/, debug/, knowledge/sessions/", () => {
    expect(getProtectionZone("status.md")).toBe("open");
    expect(getProtectionZone("decisions/topic.md")).toBe("open");
    expect(getProtectionZone("findings/topic.md")).toBe("open");
    expect(getProtectionZone("debug/topic.md")).toBe("open");
    expect(getProtectionZone("knowledge/sessions/topic.md")).toBe("open");
  });
});

// ---------------------------------------------------------------------------
// Preservation: extractFrontmatterStatus() parsing behavior
// (Validates: Requirements 3.3)
// ---------------------------------------------------------------------------

describe("Preservation: extractFrontmatterStatus() parsing", () => {
  it("correctly parses status from valid frontmatter", () => {
    fc.assert(
      fc.property(anyStatusArb, (status) => {
        const content = contentWithStatus(status);
        expect(extractFrontmatterStatus(content)).toBe(status);
      }),
      { numRuns: 50 },
    );
  });

  it("returns null when no status field exists", () => {
    expect(extractFrontmatterStatus(contentWithoutStatus)).toBeNull();
  });

  it("returns null for content without frontmatter", () => {
    expect(extractFrontmatterStatus(contentWithoutFrontmatter)).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(extractFrontmatterStatus("")).toBeNull();
  });

  it("returns null for unclosed frontmatter", () => {
    expect(extractFrontmatterStatus('---\nstatus: "locked"\n')).toBeNull();
  });

  it("returns null for content starting with non-frontmatter text", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.trimStart().startsWith("---")),
        (content) => {
          expect(extractFrontmatterStatus(content)).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });
});
