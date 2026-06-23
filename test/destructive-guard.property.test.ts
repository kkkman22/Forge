/**
 * Property + table tests for destructive-guard.ts (v2 — normalization engine).
 *
 * v2 fixes P0-1 (rule bypass via shell syntax) by normalizing the command
 * before rule matching. This suite covers the bypass constructs the v1
 * whitespace-split missed, plus a false-positive property (random
 * non-destructive commands must be allowed).
 *
 * Correctness Properties:
 *   P1: Every normalization-equivalent form of a destructive command is denied
 *   P2: infra-destroy is denied even under rollback-active (no bypass for infra)
 *   P3: guard-disabled overrides everything (always allow)
 *   P4 (false-positive): random non-destructive commands are allowed
 *
 * **Validates: Requirements R1 AC1-AC8 (v2)**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkDestructive,
  type DestructiveContext,
  normalizeCommand,
} from "../src/destructive-guard.js";

// ---------------------------------------------------------------------------
// Context fixtures
// ---------------------------------------------------------------------------

const NO_MARK: DestructiveContext = {
  rollbackActive: false,
  userSingleAllow: false,
  guardEnabled: true,
};

const ROLLBACK_ACTIVE: DestructiveContext = {
  rollbackActive: true,
  userSingleAllow: false,
  guardEnabled: true,
};

const GUARD_OFF: DestructiveContext = {
  rollbackActive: false,
  userSingleAllow: false,
  guardEnabled: false,
};

// ---------------------------------------------------------------------------
// P0-1 bypass constructs — every form MUST be denied (AC1)
// ---------------------------------------------------------------------------

describe("checkDestructive — P0-1 git reset --hard normalization", () => {
  const resetHardForms = [
    "git reset --hard",
    "git reset --hard HEAD~1",
    "git reset --hard=1", // git accepts --hard=1
    "git reset --hard origin/main",
    "env git reset --hard",
    "/usr/bin/git reset --hard",
    "/usr/local/bin/git reset --hard",
    "git --no-pager reset --hard",
    "git -c core.editor=true reset --hard",
    "git --git-dir=. reset --hard",
    "bash -c 'git reset --hard'",
    "sh -c 'git reset --hard'",
    "git reset -q --hard",
  ];

  it.each(resetHardForms)("denies %p without rollback mark", (cmd) => {
    const result = checkDestructive(cmd, NO_MARK);
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("deny");
  });
});

describe("checkDestructive — P0-1 git checkout -- discard normalization", () => {
  const checkoutForms = [
    "git checkout -- .",
    "git checkout -- *",
    "git checkout -- src/",
    "git checkout -- src/important.ts",
    "git checkout -- path/to/file.txt",
    "env git checkout -- .",
    "git --no-pager checkout -- file.txt",
  ];

  it.each(checkoutForms)("denies %p without rollback mark", (cmd) => {
    const result = checkDestructive(cmd, NO_MARK);
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("deny");
  });
});

describe("checkDestructive — P0-1 git clean / stash normalization", () => {
  const cleanStashForms = [
    "git clean -fd",
    "git clean -fdx",
    "git clean -df",
    "git clean -dfx",
    "git clean -f -d",
    "git clean -d -f",
    "env git clean -fd",
    "git stash drop",
    "git stash drop stash@{0}",
    "/usr/bin/git stash drop",
  ];

  it.each(cleanStashForms)("denies %p without rollback mark", (cmd) => {
    const result = checkDestructive(cmd, NO_MARK);
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// P0-1 infra destroy — extended tool coverage (AC4)
// ---------------------------------------------------------------------------

describe("checkDestructive — P0-1 infra destroy normalization", () => {
  const infraNoStack = [
    "terraform destroy",
    "tofu destroy", // OpenTofu
    "pulumi destroy",
    "cdk destroy",
    "terraform apply -destroy",
    "env terraform destroy",
    "/usr/local/bin/terraform destroy",
  ];

  it.each(infraNoStack)("denies %p without stack (even rollback)", (cmd) => {
    const result = checkDestructive(cmd, ROLLBACK_ACTIVE);
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("deny");
  });

  const infraWithStack = [
    "terraform destroy -target=module.foo",
    "terraform destroy --target=module.foo",
    "pulumi destroy --stack foo",
    "cdk destroy StackA",
    "tofu destroy -target=module.x",
  ];

  it.each(infraWithStack)("allows %p with explicit stack", (cmd) => {
    const result = checkDestructive(cmd, NO_MARK);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bypass under rollback-active (AC2) — git rules only
// ---------------------------------------------------------------------------

describe("checkDestructive — rollback bypass (git only)", () => {
  it("allows normalized git reset --hard under rollback-active", () => {
    const result = checkDestructive("git reset --hard", ROLLBACK_ACTIVE);
    expect(result.allowed).toBe(true);
    expect(result.bypassReason).toBe("rollback-active");
  });

  it("allows env-prefixed git reset --hard under rollback-active", () => {
    const result = checkDestructive("env git reset --hard", ROLLBACK_ACTIVE);
    expect(result.allowed).toBe(true);
    expect(result.bypassReason).toBe("rollback-active");
  });

  it("infra destroy never bypasses via rollback-active", () => {
    const result = checkDestructive("terraform destroy -target=x", ROLLBACK_ACTIVE);
    expect(result.bypassReason).not.toBe("rollback-active");
  });
});

// ---------------------------------------------------------------------------
// Guard off (AC5)
// ---------------------------------------------------------------------------

describe("checkDestructive — guard disabled", () => {
  it("allows destructive command when guard disabled", () => {
    const result = checkDestructive("git reset --hard", GUARD_OFF);
    expect(result.allowed).toBe(true);
    expect(result.bypassReason).toBe("guard-disabled");
  });
});

// ---------------------------------------------------------------------------
// P4 — false-positive property (non-destructive commands allowed)
// ---------------------------------------------------------------------------

describe("checkDestructive — false-positive property", () => {
  it("random non-destructive git commands are allowed", () => {
    const safeCmdArb = fc.constantFrom(
      "git status",
      "git log",
      "git diff",
      "git branch --show-current",
      "git add file.txt",
      "git commit -m msg",
      "git push",
      "git pull",
      "git fetch",
      "git stash list",
      "git reset HEAD~1", // soft reset, no --hard
      "git reset --soft HEAD~1",
      "ls -la",
      "npm test",
      "echo hello",
      "cat README.md",
      "vitest run",
    );
    fc.assert(
      fc.property(safeCmdArb, (cmd) => {
        const result = checkDestructive(cmd, NO_MARK);
        return result.allowed === true;
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// normalizeCommand — unit tests for the normalization engine
// ---------------------------------------------------------------------------

describe("normalizeCommand", () => {
  it("strips quotes", () => {
    expect(normalizeCommand('git "reset" --hard')).toEqual(["git", "reset", "--hard"]);
  });

  it("strips env prefix", () => {
    expect(normalizeCommand("env git reset --hard")).toEqual(["git", "reset", "--hard"]);
  });

  it("strips absolute path prefix", () => {
    expect(normalizeCommand("/usr/bin/git reset --hard")).toEqual(["git", "reset", "--hard"]);
    expect(normalizeCommand("/usr/local/bin/git reset --hard")).toEqual(["git", "reset", "--hard"]);
  });

  it("strips git global flags (--no-pager, -c k=v)", () => {
    expect(normalizeCommand("git --no-pager reset --hard")).toEqual(["git", "reset", "--hard"]);
    expect(normalizeCommand("git -c core.editor=true reset --hard")).toEqual([
      "git",
      "reset",
      "--hard",
    ]);
  });

  it("v3: bash -c / sh -c wrappers are complex (fail-closed, not expanded)", () => {
    // v3 no longer expands wrappers — isComplexCommand catches them → checkDestructive denies.
    expect(checkDestructive("bash -c 'git reset --hard'", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("sh -c 'git reset --hard'", NO_MARK).allowed).toBe(false);
  });

  it("v3: shell metacharacter commands are denied (fail-closed)", () => {
    expect(checkDestructive("git reset --hard;", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("git reset --hard&&ls", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("git reset --hard|cat", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("git reset --'hard'", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("$(git reset --hard)", NO_MARK).allowed).toBe(false);
  });

  it("v4: wrapper-prefix commands are denied (exec/sudo/nice/VAR=/bash-without-c)", () => {
    // These have no metachar and aren't bash -c, but wrap a destructive command
    // behind an unrecognized prefix → must be fail-closed denied.
    expect(checkDestructive("exec git reset --hard", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("sudo git reset --hard", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("FOO=bar git reset --hard", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("bash git reset --hard", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("nice git reset --hard", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("nohup git reset --hard", NO_MARK).allowed).toBe(false);
    expect(checkDestructive("command git reset --hard", NO_MARK).allowed).toBe(false);
    // Non-destructive commands with unrecognized prefixes still allowed (no destructive tool token).
    expect(checkDestructive("sudo ls -la", NO_MARK).allowed).toBe(true);
  });

  it("handles --hard=1 form (git accepts it)", () => {
    const norm = normalizeCommand("git reset --hard=1");
    // normalization should keep --hard recognizable (rule matches on contains)
    expect(norm.some((t) => t.startsWith("--hard"))).toBe(true);
  });

  it("leaves plain command unchanged", () => {
    expect(normalizeCommand("git status")).toEqual(["git", "status"]);
  });

  it("handles empty input", () => {
    expect(normalizeCommand("")).toEqual([]);
  });
});
