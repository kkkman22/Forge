/**
 * Tests for Ship delivery command builders in git-transaction module.
 *
 * Covers:
 *   - Property 1: Shell metacharacter rejection in all ship command builders
 *   - Property 6: Force flag correctness in buildBranchDeleteCommand
 *   - Unit tests: Normal paths for all new command builders
 *   - validateBranchName: rejects illegal characters and shell metacharacters
 *
 * **Validates: Requirements 1.1–1.6, 5.5, 6.1**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildBranchDeleteCommand,
  buildCheckoutCommand,
  buildMergeAbortCommand,
  buildMergeCommand,
  buildPushCommand,
  validateBranchName,
} from "../src/git-transaction.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Strings guaranteed to contain at least one shell metacharacter. */
const shellMetacharStringArb = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.constantFrom("`", "$(", '"', ";", "|", "&", "<", ">"),
    fc.string({ minLength: 0, maxLength: 50 }),
  )
  .map(([prefix, meta, suffix]) => `${prefix}${meta}${suffix}`);

/** Safe branch names that pass validateBranchName. */
const safeBranchNameArb = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")), {
    minLength: 2,
    maxLength: 50,
  })
  .map((chars) => chars.join(""))
  .filter((s) => !s.includes("..") && !/^[./-]/.test(s) && !/[./-]$/.test(s));

/** Safe remote names (alphanumeric, dots, hyphens). */
const safeRemoteArb = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_.".split("")), {
    minLength: 1,
    maxLength: 30,
  })
  .map((chars) => chars.join(""))
  .filter((s) => s.length > 0 && !s.startsWith("-") && !s.startsWith("."));

// ---------------------------------------------------------------------------
// Feature: ship-delivery-unification, Property 1: Shell metacharacter rejection
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, Property 1: Shell metacharacter rejection", () => {
  it("buildCheckoutCommand rejects branch names with shell metacharacters", () => {
    fc.assert(
      fc.property(shellMetacharStringArb, (dangerous) => {
        expect(() => buildCheckoutCommand(dangerous)).toThrow();
      }),
      { numRuns: 50 },
    );
  });

  it("buildMergeCommand rejects branch names with shell metacharacters", () => {
    fc.assert(
      fc.property(shellMetacharStringArb, fc.boolean(), (dangerous, noFf) => {
        expect(() => buildMergeCommand(dangerous, noFf)).toThrow();
      }),
      { numRuns: 50 },
    );
  });

  it("buildBranchDeleteCommand rejects branch names with shell metacharacters", () => {
    fc.assert(
      fc.property(shellMetacharStringArb, fc.boolean(), (dangerous, force) => {
        expect(() => buildBranchDeleteCommand(dangerous, force)).toThrow();
      }),
      { numRuns: 50 },
    );
  });

  it("buildPushCommand rejects branch names with shell metacharacters", () => {
    fc.assert(
      fc.property(
        shellMetacharStringArb,
        safeRemoteArb,
        fc.boolean(),
        (dangerous, remote, setUpstream) => {
          expect(() => buildPushCommand(remote, dangerous, setUpstream)).toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("buildPushCommand rejects remote names with shell metacharacters", () => {
    fc.assert(
      fc.property(
        safeBranchNameArb,
        shellMetacharStringArb,
        fc.boolean(),
        (branch, dangerous, setUpstream) => {
          expect(() => buildPushCommand(dangerous, branch, setUpstream)).toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: ship-delivery-unification, Property 6: Force flag correctness
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, Property 6: Force flag correctness", () => {
  it("buildBranchDeleteCommand uses -D when force=true and -d when force=false", () => {
    fc.assert(
      fc.property(safeBranchNameArb, fc.boolean(), (branch, force) => {
        const cmd = buildBranchDeleteCommand(branch, force);
        expect(cmd.executable).toBe("git");
        expect(cmd.args[0]).toBe("branch");

        if (force) {
          expect(cmd.args[1]).toBe("-D");
        } else {
          expect(cmd.args[1]).toBe("-d");
        }

        expect(cmd.args[2]).toBe(branch);
        expect(cmd.args).toHaveLength(3);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests: Normal paths
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, Unit: Command builder normal paths", () => {
  it("buildCheckoutCommand produces correct command", () => {
    const cmd = buildCheckoutCommand("main");
    expect(cmd).toEqual({
      executable: "git",
      args: ["checkout", "main"],
    });
  });

  it("buildMergeCommand with noFf=true includes --no-ff", () => {
    const cmd = buildMergeCommand("feature/test", true);
    expect(cmd).toEqual({
      executable: "git",
      args: ["merge", "--no-ff", "feature/test"],
    });
  });

  it("buildMergeCommand with noFf=false omits --no-ff", () => {
    const cmd = buildMergeCommand("feature/test", false);
    expect(cmd).toEqual({
      executable: "git",
      args: ["merge", "feature/test"],
    });
  });

  it("buildBranchDeleteCommand with force=false uses -d", () => {
    const cmd = buildBranchDeleteCommand("feature/test", false);
    expect(cmd).toEqual({
      executable: "git",
      args: ["branch", "-d", "feature/test"],
    });
  });

  it("buildBranchDeleteCommand with force=true uses -D", () => {
    const cmd = buildBranchDeleteCommand("feature/test", true);
    expect(cmd).toEqual({
      executable: "git",
      args: ["branch", "-D", "feature/test"],
    });
  });

  it("buildPushCommand with setUpstream=true includes -u", () => {
    const cmd = buildPushCommand("origin", "feature/test", true);
    expect(cmd).toEqual({
      executable: "git",
      args: ["push", "-u", "origin", "feature/test"],
    });
  });

  it("buildPushCommand with setUpstream=false omits -u", () => {
    const cmd = buildPushCommand("origin", "feature/test", false);
    expect(cmd).toEqual({
      executable: "git",
      args: ["push", "origin", "feature/test"],
    });
  });

  it("buildMergeAbortCommand produces git merge --abort", () => {
    const cmd = buildMergeAbortCommand();
    expect(cmd).toEqual({
      executable: "git",
      args: ["merge", "--abort"],
    });
  });
});

// ---------------------------------------------------------------------------
// validateBranchName tests
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, validateBranchName", () => {
  it("accepts safe branch names", () => {
    fc.assert(
      fc.property(safeBranchNameArb, (branch) => {
        expect(() => validateBranchName(branch)).not.toThrow();
      }),
      { numRuns: 50 },
    );
  });

  it("rejects branch names with shell metacharacters", () => {
    fc.assert(
      fc.property(shellMetacharStringArb, (dangerous) => {
        expect(() => validateBranchName(dangerous)).toThrow();
      }),
      { numRuns: 50 },
    );
  });

  it("rejects branch names with Git-illegal characters (spaces, tildes, etc.)", () => {
    const illegalNames = [
      "branch with spaces",
      "branch~1",
      "branch^2",
      "branch:other",
      "branch?query",
      "branch*wild",
      "branch[0]",
      "branch\\escape",
      "branch@{yesterday}",
      "branch..traversal",
    ];

    for (const name of illegalNames) {
      expect(() => validateBranchName(name), `Expected "${name}" to be rejected`).toThrow();
    }
  });

  it("accepts branch names with slashes and dots (valid Git ref format)", () => {
    const validNames = [
      "main",
      "feature/my-feature",
      "release/v1.0",
      "forge/ship-delivery-unification",
      "a-b-c",
      "a_b_c",
    ];

    for (const name of validNames) {
      expect(() => validateBranchName(name), `Expected "${name}" to be accepted`).not.toThrow();
    }
  });
});
