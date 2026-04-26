/**
 * Property-based tests for the git-transaction module.
 *
 * Covers:
 *   - Property 5: 提交消息格式化
 *   - Property 6: 回滚往返一致性
 *   - Property 14: Shell 注入安全性
 *
 * **Validates: Requirements 2.1, 2.4, 2.7, 6.1–6.7**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildCleanCommand,
  buildCommitCommand,
  buildResetCommand,
  buildStashCommand,
  containsShellMetacharacters,
  sanitizeBranchName,
  validatePathSafety,
} from "../src/git-transaction.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Positive iteration numbers (1-based). */
const iterationNumberArb = fc.integer({ min: 1, max: 10_000 });

/** Non-empty summary text (single-line, no newlines). */
const summaryArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => !s.includes("\n") && !s.includes("\r") && s.trim().length > 0);

/** Strings guaranteed to contain at least one shell metacharacter. */
const shellMetacharStringArb = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.constantFrom("`", "$(", '"', ";", "|", "&", "<", ">"),
    fc.string({ minLength: 0, maxLength: 50 }),
  )
  .map(([prefix, meta, suffix]) => `${prefix}${meta}${suffix}`);

/** Arbitrary strings that may or may not contain shell metacharacters. */
const arbitraryStringArb = fc.string({ minLength: 0, maxLength: 300 });

/** Branch name candidates — arbitrary strings including dangerous characters. */
const branchNameArb = fc.string({ minLength: 1, maxLength: 100 });

/** Path candidates for safety validation — includes dangerous patterns. */
const dangerousPathArb = fc.constantFrom(
  "../etc/passwd",
  "foo/../../bar",
  "path\0with\0nulls",
  "`whoami`",
  "$(rm -rf /)",
  "-flag-injection",
  "file;rm -rf /",
  "file|cat /etc/passwd",
  "",
);

/** Safe path candidates — alphanumeric with slashes. */
const safePathArb = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789/_-.".split("")), {
    minLength: 1,
    maxLength: 80,
  })
  .map((chars) => chars.join(""))
  .filter((s) => !s.includes("..") && !s.startsWith("-") && s.length > 0);

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 5: 提交消息格式化
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 5: 提交消息格式化", () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * buildCommitCommand produces a GitCommand whose message arg contains
   * the iteration number and summary text.
   */
  it("commit message arg contains iteration number and summary", () => {
    fc.assert(
      fc.property(iterationNumberArb, summaryArb, (iteration, summary) => {
        const message = `forge(loop): iteration ${iteration} — ${summary}`;
        const cmd = buildCommitCommand(message);

        // The message is the third element in args: ["commit", "-m", message]
        const msgArg = cmd.args[2];
        expect(msgArg).toContain(String(iteration));
        expect(msgArg).toContain(summary);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.1**
   *
   * The commit message in the args array is non-empty and single-line.
   */
  it("commit message is a non-empty single-line string", () => {
    fc.assert(
      fc.property(iterationNumberArb, summaryArb, (iteration, summary) => {
        const message = `forge(loop): iteration ${iteration} — ${summary}`;
        const cmd = buildCommitCommand(message);

        const msgArg = cmd.args[2];
        expect(msgArg.length).toBeGreaterThan(0);
        expect(msgArg).not.toContain("\n");
        expect(msgArg).not.toContain("\r");
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.1**
   *
   * buildCommitCommand always produces a GitCommand with executable "git"
   * and args starting with ["commit", "-m"].
   */
  it("buildCommitCommand produces correct command structure", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (message) => {
        const cmd = buildCommitCommand(message);

        expect(cmd.executable).toBe("git");
        expect(cmd.args[0]).toBe("commit");
        expect(cmd.args[1]).toBe("-m");
        expect(cmd.args[2]).toBe(message);
        expect(cmd.args).toHaveLength(3);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 6: 回滚往返一致性
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 6: 回滚往返一致性", () => {
  /**
   * **Validates: Requirements 2.4, 2.7**
   *
   * buildResetCommand and buildCleanCommand produce the correct rollback
   * commands for restoring the working directory.
   */
  it("buildResetCommand produces git reset --hard HEAD", () => {
    const cmd = buildResetCommand();

    expect(cmd.executable).toBe("git");
    expect(cmd.args).toEqual(["reset", "--hard", "HEAD"]);
  });

  it("buildCleanCommand produces git clean -fd", () => {
    const cmd = buildCleanCommand();

    expect(cmd.executable).toBe("git");
    expect(cmd.args).toEqual(["clean", "-fd"]);
  });

  /**
   * **Validates: Requirements 2.4, 2.7**
   *
   * Rollback commands are deterministic — same output every time.
   */
  it("rollback commands are deterministic (same output every invocation)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (_n) => {
        const reset1 = buildResetCommand();
        const reset2 = buildResetCommand();
        const clean1 = buildCleanCommand();
        const clean2 = buildCleanCommand();

        expect(reset1).toEqual(reset2);
        expect(clean1).toEqual(clean2);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.4, 2.7**
   *
   * Failed events don't leave traces in committed history — the rollback
   * commands target HEAD (not a specific commit), ensuring the working
   * directory returns to the last committed state.
   */
  it("reset command always targets HEAD (no iteration-specific state leaks)", () => {
    fc.assert(
      fc.property(iterationNumberArb, (_iteration) => {
        const cmd = buildResetCommand();

        // Regardless of which iteration failed, reset always targets HEAD
        expect(cmd.args).toContain("HEAD");
        expect(cmd.args).toContain("--hard");
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: audit-hardening, Property: buildStashCommand 结构正确性
// ---------------------------------------------------------------------------

describe("Feature: audit-hardening, buildStashCommand 结构正确性", () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * buildStashCommand always returns a GitCommand with executable "git"
   * and args ["stash", "--include-untracked", "-m", message] for any message string.
   */
  it("buildStashCommand produces correct executable and args structure for any message", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (message) => {
        const cmd = buildStashCommand(message);

        expect(cmd.executable).toBe("git");
        expect(cmd.args).toEqual(["stash", "--include-untracked", "-m", message]);
        expect(cmd.args).toHaveLength(4);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.1**
   *
   * Shell metacharacters in the stash message are preserved as literal data
   * in the args array, never interpolated into a shell string.
   */
  it("shell metacharacters in stash message are preserved verbatim", () => {
    fc.assert(
      fc.property(shellMetacharStringArb, (dangerous) => {
        const cmd = buildStashCommand(dangerous);

        expect(cmd.executable).toBe("git");
        expect(cmd.args[3]).toBe(dangerous);
        expect(cmd.args).toHaveLength(4);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 14: Shell 注入安全性
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 14: Shell 注入安全性", () => {
  /**
   * **Validates: Requirements 6.1–6.7**
   *
   * Strings containing shell metacharacters are preserved as literal data
   * in the args array when passed through buildCommitCommand.
   */
  it("shell metacharacters are preserved as literal data in commit args", () => {
    fc.assert(
      fc.property(shellMetacharStringArb, (dangerous) => {
        const cmd = buildCommitCommand(dangerous);

        // The dangerous string must appear verbatim in the args array
        expect(cmd.args[2]).toBe(dangerous);
        // It is a discrete array element, not interpolated into a shell string
        expect(cmd.args).toHaveLength(3);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1–6.7**
   *
   * containsShellMetacharacters correctly detects all shell metacharacters.
   */
  it("containsShellMetacharacters detects all shell metacharacters", () => {
    fc.assert(
      fc.property(shellMetacharStringArb, (dangerous) => {
        expect(containsShellMetacharacters(dangerous)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1–6.7**
   *
   * containsShellMetacharacters returns false for safe alphanumeric strings.
   */
  it("containsShellMetacharacters returns false for safe strings", () => {
    const safeStringArb = fc
      .array(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_./".split(""),
        ),
        { minLength: 0, maxLength: 100 },
      )
      .map((chars) => chars.join(""));

    fc.assert(
      fc.property(safeStringArb, (safe) => {
        expect(containsShellMetacharacters(safe)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1–6.7**
   *
   * The generated GitCommand's executable is always "git".
   */
  it("GitCommand executable is always 'git'", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (message) => {
        const cmd = buildCommitCommand(message);
        expect(cmd.executable).toBe("git");
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1–6.7**
   *
   * sanitizeBranchName removes dangerous characters from branch names.
   */
  it("sanitizeBranchName removes dangerous characters", () => {
    fc.assert(
      fc.property(branchNameArb, (name) => {
        const sanitized = sanitizeBranchName(name);

        // Sanitized name should not contain shell metacharacters
        // (except those that are valid in branch names like dots and slashes)
        for (const ch of sanitized) {
          // Only alphanumeric, hyphens, underscores, forward slashes, and dots allowed
          expect(ch).toMatch(/[a-zA-Z0-9\-_./]/);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1–6.7**
   *
   * sanitizeBranchName does not contain path traversal patterns.
   */
  it("sanitizeBranchName eliminates path traversal patterns", () => {
    fc.assert(
      fc.property(branchNameArb, (name) => {
        const sanitized = sanitizeBranchName(name);

        // No consecutive dots (path traversal)
        expect(sanitized).not.toContain("..");
        // No consecutive slashes
        expect(sanitized).not.toMatch(/\/{2,}/);
        // No .lock suffix
        expect(sanitized.toLowerCase()).not.toMatch(/\.lock$/);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1–6.7**
   *
   * validatePathSafety rejects paths with injection patterns.
   */
  it("validatePathSafety rejects paths with injection patterns", () => {
    fc.assert(
      fc.property(dangerousPathArb, (path) => {
        expect(validatePathSafety(path)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1–6.7**
   *
   * validatePathSafety accepts safe paths.
   */
  it("validatePathSafety accepts safe paths", () => {
    fc.assert(
      fc.property(safePathArb, (path) => {
        expect(validatePathSafety(path)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
