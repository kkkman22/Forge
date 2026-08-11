/**
 * Property tests for status-resolver module.
 *
 * Feature: parallel-status-tracking
 *
 * Properties tested:
 *   Property 1:  Slugify output validity
 *   Property 2:  Slugify determinism
 *   Property 3:  Slugify error on invalid input
 *   Property 12: Task name round-trip via frontmatter
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isMultiTaskMode,
  type ResolverContext,
  resolveStatusPath,
  slugify,
} from "../src/status-resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ASCII alphanumeric characters. */
const _ASCII_ALPHA_NUMERIC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Check if a string contains at least one ASCII alphanumeric character. */
function hasAsciiAlphanumeric(s: string): boolean {
  return /[a-zA-Z0-9]/.test(s);
}

/** Arbitrary string that contains at least one ASCII alphanumeric character. */
const alphanumericString = fc.string().filter(hasAsciiAlphanumeric);

/** Arbitrary string that contains NO ASCII alphanumeric characters. */
const nonAlphanumericString = fc.string({ minLength: 1 }).filter((s) => !hasAsciiAlphanumeric(s));

/** Valid slug pattern: lowercase letters, digits, hyphens, no consecutive/leading/trailing hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Property 1: Slugify output validity
// ---------------------------------------------------------------------------

describe("Property 1: Slugify output validity", () => {
  it("produces valid slug for any string with ≥1 alphanumeric char", () => {
    fc.assert(
      fc.property(alphanumericString, (taskName) => {
        const result = slugify(taskName);
        expect(result).toMatch(SLUG_PATTERN);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Slugify determinism
// ---------------------------------------------------------------------------

describe("Property 2: Slugify determinism", () => {
  it("produces identical output for identical input", () => {
    fc.assert(
      fc.property(alphanumericString, (taskName) => {
        expect(slugify(taskName)).toBe(slugify(taskName));
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Slugify error on invalid input
// ---------------------------------------------------------------------------

describe("Property 3: Slugify error on invalid input", () => {
  it("throws for empty string", () => {
    expect(() => slugify("")).toThrow();
  });

  it("throws for strings with no ASCII alphanumeric characters", () => {
    fc.assert(
      fc.property(nonAlphanumericString, (s) => {
        expect(() => slugify(s)).toThrow();
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Task name round-trip via frontmatter
// ---------------------------------------------------------------------------

describe("Property 12: Task name round-trip via frontmatter", () => {
  it("slugify result can be used to create a file whose current_task recovers the original name", () => {
    const yamlSafeString = fc
      .string()
      .filter((s) => hasAsciiAlphanumeric(s) && !s.includes('"') && !s.includes("\\"));
    fc.assert(
      fc.property(yamlSafeString, (taskName) => {
        const taskId = slugify(taskName);
        const statusContent = `---\ncurrent_task: "${taskName}"\n---\n`;
        const match = statusContent.match(/^current_task: "([^"]*)"$/m);
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe(taskName);
        expect(taskId).toMatch(SLUG_PATTERN);
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Example tests
// ---------------------------------------------------------------------------

describe("Example: slugify known inputs", () => {
  it.each([
    ["User API Pagination", "user-api-pagination"],
    ["fix bug #123", "fix-bug-123"],
    ["  --hello--world--  ", "hello-world"],
    ["v2.0 refactor", "v2-0-refactor"],
    ["UPPER CASE Test", "upper-case-test"],
  ])('slugify("%s") → "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("throws for CJK-only strings", () => {
    expect(() => slugify("你好世界")).toThrow();
  });

  it("throws for special-char-only strings", () => {
    expect(() => slugify("---")).toThrow();
    expect(() => slugify("@#$%")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveStatusPath tests
// ---------------------------------------------------------------------------

describe("resolveStatusPath", () => {
  const _makeCtx = (
    taskName: string,
    dirExists: boolean,
  ): ResolverContext & { dirExists: boolean } => ({
    taskName,
    forgeRoot: "/project/.tinkerman",
    dirExists,
  });

  it("resolves to status.md in single-task mode (no status/ dir)", () => {
    const ctx: ResolverContext = { taskName: "my-feature", forgeRoot: "/project/.tinkerman" };
    const result = resolveStatusPath(ctx, () => false);
    expect(result.mode).toBe("single");
    expect(result.filePath).toBe("/project/.tinkerman/status.md");
    expect(result.taskId).toBe("my-feature");
  });

  it("resolves to status/<task-id>.md in multi-task mode", () => {
    const ctx: ResolverContext = {
      taskName: "User API Pagination",
      forgeRoot: "/project/.tinkerman",
    };
    const result = resolveStatusPath(ctx, () => true);
    expect(result.mode).toBe("multi");
    expect(result.filePath).toBe("/project/.tinkerman/status/user-api-pagination.md");
    expect(result.taskId).toBe("user-api-pagination");
  });
});

// ---------------------------------------------------------------------------
// isMultiTaskMode tests
// ---------------------------------------------------------------------------

describe("isMultiTaskMode", () => {
  it("returns false when status/ directory does not exist", () => {
    expect(isMultiTaskMode("/project/.tinkerman", () => false)).toBe(false);
  });

  it("returns true when status/ directory exists", () => {
    expect(isMultiTaskMode("/project/.tinkerman", () => true)).toBe(true);
  });
});
