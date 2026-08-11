/**
 * Property 23: 状态文件保护区技术强制
 *
 * Uses fast-check to verify that:
 *   - Frozen zone files are correctly identified (specs/, plans/, config.md)
 *   - Guarded zone files are correctly identified (progress/, reviews/, knowledge/)
 *   - Open zone files are correctly identified (status.md, decisions/, findings/, debug/)
 *   - Writes to frozen files with "locked" or "approved" status are blocked
 *   - Writes to frozen files with "draft" status are allowed
 *   - Writes to guarded and open zone files are never blocked
 *   - extractFrontmatterStatus correctly parses status from YAML frontmatter
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkWritePermission, extractFrontmatterStatus, getProtectionZone } from "../src/state.js";

// ---------------------------------------------------------------------------
// Generators
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

/** Arbitrary status values that should trigger blocking. */
const blockingStatusArb: fc.Arbitrary<string> = fc.constantFrom("locked", "approved");

/** Arbitrary status values that should NOT trigger blocking. */
const nonBlockingStatusArb: fc.Arbitrary<string> = fc.constantFrom("draft", "in_progress", "new");

// ---------------------------------------------------------------------------
// Property 23: Protection zone classification
// ---------------------------------------------------------------------------

describe("Property 23: 状态文件保护区分类", () => {
  it("specs/ paths are always frozen", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`specs/${topic}/spec.md`)).toBe("frozen");
      }),
      { numRuns: 40 },
    );
  });

  it("plans/ paths are always frozen", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`plans/${topic}.md`)).toBe("frozen");
      }),
      { numRuns: 40 },
    );
  });

  it("config.md is always frozen", () => {
    expect(getProtectionZone("config.md")).toBe("frozen");
  });

  it("progress/ paths are always guarded", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`progress/${topic}.md`)).toBe("guarded");
      }),
      { numRuns: 40 },
    );
  });

  it("reviews/ paths are always guarded", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`reviews/${topic}.md`)).toBe("guarded");
      }),
      { numRuns: 40 },
    );
  });

  it("knowledge/instincts.md is guarded", () => {
    expect(getProtectionZone("knowledge/instincts.md")).toBe("guarded");
  });

  it("knowledge/known-failures.md is guarded", () => {
    expect(getProtectionZone("knowledge/known-failures.md")).toBe("guarded");
  });

  it("knowledge/solutions/ paths are guarded", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`knowledge/solutions/${topic}.md`)).toBe("guarded");
      }),
      { numRuns: 40 },
    );
  });

  it("status.md is open", () => {
    expect(getProtectionZone("status.md")).toBe("open");
  });

  it("decisions/ paths are open", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`decisions/${topic}.md`)).toBe("open");
      }),
      { numRuns: 40 },
    );
  });

  it("findings/ paths are open", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`findings/${topic}.md`)).toBe("open");
      }),
      { numRuns: 40 },
    );
  });

  it("debug/ paths are open", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`debug/${topic}.md`)).toBe("open");
      }),
      { numRuns: 40 },
    );
  });

  it("knowledge/sessions/ paths are open", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        expect(getProtectionZone(`knowledge/sessions/${topic}.md`)).toBe("open");
      }),
      { numRuns: 40 },
    );
  });

  it(".tinkerman/ prefix is stripped before classification", () => {
    expect(getProtectionZone(".tinkerman/config.md")).toBe("frozen");
    expect(getProtectionZone(".tinkerman/status.md")).toBe("open");
    expect(getProtectionZone(".tinkerman/progress/topic.md")).toBe("guarded");
  });
});

// ---------------------------------------------------------------------------
// Property 23: Frontmatter status extraction
// ---------------------------------------------------------------------------

describe("Property 23: Frontmatter status 提取", () => {
  it("extracts status from valid frontmatter", () => {
    fc.assert(
      fc.property(fc.constantFrom("draft", "locked", "approved", "in_progress"), (status) => {
        const content = contentWithStatus(status);
        expect(extractFrontmatterStatus(content)).toBe(status);
      }),
      { numRuns: 20 },
    );
  });

  it("returns null when no status field exists", () => {
    expect(extractFrontmatterStatus(contentWithoutStatus)).toBeNull();
  });

  it("returns null for content without frontmatter", () => {
    expect(extractFrontmatterStatus("# Just a heading\n\nSome content")).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(extractFrontmatterStatus("")).toBeNull();
  });

  it("returns null for unclosed frontmatter", () => {
    expect(extractFrontmatterStatus('---\nstatus: "locked"\n')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 23: Write permission checks
// ---------------------------------------------------------------------------

describe("Property 23: 写入权限检查", () => {
  it("frozen files with locked/approved status are blocked", () => {
    fc.assert(
      fc.property(frozenPathArb, blockingStatusArb, (path, status) => {
        const result = checkWritePermission(path, contentWithStatus(status));
        expect(result.blocked).toBe(true);
        expect(result.reason).toContain("写入被阻断");
        expect(result.reason).toContain(status);
      }),
      { numRuns: 40 },
    );
  });

  it("frozen files with draft status are NOT blocked", () => {
    fc.assert(
      fc.property(frozenPathArb, nonBlockingStatusArb, (path, status) => {
        const result = checkWritePermission(path, contentWithStatus(status));
        expect(result.blocked).toBe(false);
      }),
      { numRuns: 40 },
    );
  });

  it("frozen files without status field are NOT blocked", () => {
    fc.assert(
      fc.property(frozenPathArb, (path) => {
        const result = checkWritePermission(path, contentWithoutStatus);
        expect(result.blocked).toBe(false);
      }),
      { numRuns: 40 },
    );
  });

  it("guarded zone files are NEVER blocked by checkWritePermission", () => {
    fc.assert(
      fc.property(guardedPathArb, blockingStatusArb, (path, status) => {
        const result = checkWritePermission(path, contentWithStatus(status));
        expect(result.blocked).toBe(false);
      }),
      { numRuns: 40 },
    );
  });

  it("open zone files are NEVER blocked by checkWritePermission", () => {
    fc.assert(
      fc.property(openPathArb, blockingStatusArb, (path, status) => {
        const result = checkWritePermission(path, contentWithStatus(status));
        expect(result.blocked).toBe(false);
      }),
      { numRuns: 40 },
    );
  });

  it("blocked writes always include the file path in the reason", () => {
    fc.assert(
      fc.property(frozenPathArb, blockingStatusArb, (path, status) => {
        const result = checkWritePermission(path, contentWithStatus(status));
        if (result.blocked) {
          expect(result.reason).toContain(path);
        }
      }),
      { numRuns: 40 },
    );
  });

  it("non-blocked writes always have empty reason", () => {
    fc.assert(
      fc.property(openPathArb, (path) => {
        const result = checkWritePermission(path, contentWithStatus("draft"));
        expect(result.reason).toBe("");
      }),
      { numRuns: 40 },
    );
  });
});
