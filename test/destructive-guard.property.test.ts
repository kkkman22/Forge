/**
 * Property + table tests for destructive-guard.ts
 *
 * Correctness Properties:
 *   P1: Every git rule is denied when neither rollback-active nor single-allow is set
 *   P2: infra-destroy is denied even when rollback-active is set (no bypass for infra)
 *   P3: guard-disabled overrides everything (always allow)
 *
 * Table coverage (R1 AC1-AC6):
 *   - git rule × no-mark         → deny
 *   - git rule × rollback-active → allow-bypass (rollback-active)
 *   - git rule × single-allow    → allow-bypass (user-single-allow)
 *   - infra destroy × no stack   → deny (even with rollback-active)
 *   - infra destroy × stack      → allow
 *   - guard off                  → allow (guard-disabled)
 *   - non-destructive command    → allow
 *
 * **Validates: Requirements R1 AC1-AC6**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkDestructive,
  DESTRUCTIVE_RULES,
  type DestructiveContext,
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

const SINGLE_ALLOW: DestructiveContext = {
  rollbackActive: false,
  userSingleAllow: true,
  guardEnabled: true,
};

const GUARD_OFF: DestructiveContext = {
  rollbackActive: false,
  userSingleAllow: false,
  guardEnabled: false,
};

// ---------------------------------------------------------------------------
// Git destructive commands — table-driven (AC1, AC2, AC3)
// ---------------------------------------------------------------------------

describe("checkDestructive — git rules", () => {
  const gitCommands: ReadonlyArray<{ name: string; cmd: string[] }> = [
    { name: "git reset --hard", cmd: ["git", "reset", "--hard"] },
    { name: "git reset --hard HEAD~1", cmd: ["git", "reset", "--hard", "HEAD~1"] },
    { name: "git checkout -- .", cmd: ["git", "checkout", "--", "."] },
    { name: "git clean -fd", cmd: ["git", "clean", "-fd"] },
    { name: "git clean -fdx", cmd: ["git", "clean", "-fdx"] },
    { name: "git stash drop", cmd: ["git", "stash", "drop"] },
  ];

  it.each(gitCommands)("AC1: denies $name with no rollback mark", ({ cmd }) => {
    const result = checkDestructive(cmd, NO_MARK);
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("deny");
    expect(result.matchedRule).toBeDefined();
  });

  it.each(gitCommands)("AC2: allows $name under rollback-active with bypass_reason", ({ cmd }) => {
    const result = checkDestructive(cmd, ROLLBACK_ACTIVE);
    expect(result.allowed).toBe(true);
    expect(result.bypassReason).toBe("rollback-active");
  });

  it.each(gitCommands)("AC3: allows $name under user-single-allow with bypass_reason", ({
    cmd,
  }) => {
    const result = checkDestructive(cmd, SINGLE_ALLOW);
    expect(result.allowed).toBe(true);
    expect(result.bypassReason).toBe("user-single-allow");
  });
});

// ---------------------------------------------------------------------------
// Infra destroy — AC4
// ---------------------------------------------------------------------------

describe("checkDestructive — infra destroy", () => {
  it("AC4: denies terraform destroy without stack even under rollback-active", () => {
    const result = checkDestructive(["terraform", "destroy"], ROLLBACK_ACTIVE);
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("deny");
  });

  it("AC4: denies pulumi destroy without stack", () => {
    const result = checkDestructive(["pulumi", "destroy"], NO_MARK);
    expect(result.allowed).toBe(false);
  });

  it("AC4: denies cdk destroy without stack", () => {
    const result = checkDestructive(["cdk", "destroy"], NO_MARK);
    expect(result.allowed).toBe(false);
  });

  it("AC4: allows terraform destroy with explicit stack target", () => {
    const result = checkDestructive(["terraform", "destroy", "-target=module.foo"], NO_MARK);
    expect(result.allowed).toBe(true);
  });

  it("AC4: infra destroy never bypasses via rollback-active", () => {
    const result = checkDestructive(["terraform", "destroy", "-target=x"], ROLLBACK_ACTIVE);
    expect(result.bypassReason).not.toBe("rollback-active");
  });
});

// ---------------------------------------------------------------------------
// Guard off + non-destructive — AC5, AC6
// ---------------------------------------------------------------------------

describe("checkDestructive — guard toggle & non-destructive", () => {
  it("AC5: guard-disabled allows destructive git command", () => {
    const result = checkDestructive(["git", "reset", "--hard"], GUARD_OFF);
    expect(result.allowed).toBe(true);
    expect(result.bypassReason).toBe("guard-disabled");
  });

  it("AC6: non-destructive git command is allowed regardless", () => {
    const result = checkDestructive(["git", "status"], NO_MARK);
    expect(result.allowed).toBe(true);
  });

  it("AC6: arbitrary command is allowed (not destructive)", () => {
    const result = checkDestructive(["ls", "-la"], NO_MARK);
    expect(result.allowed).toBe(true);
  });

  it("AC6: git reset without --hard is allowed (soft reset)", () => {
    const result = checkDestructive(["git", "reset", "HEAD~1"], NO_MARK);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("checkDestructive — properties", () => {
  // P1: every git rule denied without marks
  it("P1: git rules denied when no bypass mark set", () => {
    const gitCommandsArb = fc.constantFrom(
      ["git", "reset", "--hard"],
      ["git", "clean", "-fd"],
      ["git", "stash", "drop"],
      ["git", "checkout", "--", "."],
    );
    fc.assert(
      fc.property(gitCommandsArb, (cmd) => {
        const result = checkDestructive(cmd, NO_MARK);
        return result.allowed === false && result.verdict === "deny";
      }),
    );
  });

  // P2: infra destroy denied under rollback-active (no bypass)
  it("P2: infra destroy never bypasses via rollback-active", () => {
    const infraArb = fc.constantFrom(
      ["terraform", "destroy"],
      ["pulumi", "destroy"],
      ["cdk", "destroy"],
    );
    fc.assert(
      fc.property(infraArb, (cmd) => {
        const result = checkDestructive(cmd, ROLLBACK_ACTIVE);
        return result.allowed === false;
      }),
    );
  });

  // P3: guard-disabled always allows
  it("P3: guard-disabled allows all rules", () => {
    const cmdArb = fc.constantFrom(
      ["git", "reset", "--hard"],
      ["terraform", "destroy"],
      ["git", "clean", "-fdx"],
    );
    fc.assert(
      fc.property(cmdArb, (cmd) => {
        const result = checkDestructive(cmd, GUARD_OFF);
        return result.allowed === true && result.bypassReason === "guard-disabled";
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Registry shape
// ---------------------------------------------------------------------------

describe("DESTRUCTIVE_RULES", () => {
  it("every rule has unique id and category git|infra", () => {
    const ids = DESTRUCTIVE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of DESTRUCTIVE_RULES) {
      expect(["git", "infra"]).toContain(rule.category);
      expect(typeof rule.matches).toBe("function");
    }
  });

  it("registry covers git reset --hard and terraform destroy", () => {
    const all = DESTRUCTIVE_RULES.map((r) => r.id);
    expect(all.length).toBeGreaterThan(0);
    // sanity: at least one git and one infra rule
    expect(DESTRUCTIVE_RULES.some((r) => r.category === "git")).toBe(true);
    expect(DESTRUCTIVE_RULES.some((r) => r.category === "infra")).toBe(true);
  });
});
