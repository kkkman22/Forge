/**
 * Contract tests for routing constants sync between code and SKILL.md.
 *
 * Verifies that tier names, command sequences, and classification thresholds
 * in SKILL.md documents match the actual TypeScript implementation.
 *
 * **Validates: Routing Constants Sync Contract**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { TaskSignals } from "../src/router.js";
import { classifyTask, type ProjectPhase, type TaskType, type Tier } from "../src/router.js";
import { getCommandSequence } from "../src/skill-scheduler.js";

const ROOT = resolve(import.meta.dirname, "..");

const routerSkill = readFileSync(
  resolve(ROOT, "skills/tinkerman/lib/router/instructions.md"),
  "utf-8",
);

const claudeMd = readFileSync(resolve(ROOT, "CLAUDE.md"), "utf-8");

// ---------------------------------------------------------------------------
// Helper: build TaskSignals with defaults
// ---------------------------------------------------------------------------

function signals(overrides: Partial<TaskSignals> = {}): TaskSignals {
  return {
    filesAffected: 0,
    linesChanged: 0,
    hasExistingSpec: false,
    hasNewService: false,
    hasNewDatabase: false,
    hasAuthChanges: false,
    isVagueRequirement: false,
    hasClearRequirements: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tier names consistency
// ---------------------------------------------------------------------------

describe("Tier names in SKILL.md match router.ts", () => {
  const tiers: Tier[] = ["light", "standard", "full"];

  for (const tier of tiers) {
    it(`router SKILL.md mentions tier "${tier}"`, () => {
      expect(routerSkill).toContain(tier);
    });

    it(`CLAUDE.md mentions tier "${tier}" or its Chinese equivalent`, () => {
      // CLAUDE.md uses Chinese: 轻量/标准/全量 and English: Light/Standard/Full
      const found =
        claudeMd.toLowerCase().includes(tier) ||
        claudeMd.includes(tier === "light" ? "轻量" : tier === "standard" ? "标准" : "全量");
      expect(found, `CLAUDE.md missing tier "${tier}"`).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Task type names consistency
// ---------------------------------------------------------------------------

describe("Task type names in SKILL.md match router.ts", () => {
  const taskTypes: TaskType[] = ["frontend", "backend", "fullstack", "data", "infra", "docs"];

  for (const tt of taskTypes) {
    it(`router SKILL.md mentions task type "${tt}"`, () => {
      expect(routerSkill).toContain(tt);
    });
  }
});

// ---------------------------------------------------------------------------
// Project phase names consistency
// ---------------------------------------------------------------------------

describe("Project phase names in SKILL.md match router.ts", () => {
  const phases: ProjectPhase[] = ["greenfield", "iteration", "refactor", "bugfix"];

  for (const phase of phases) {
    it(`router SKILL.md mentions project phase "${phase}"`, () => {
      expect(routerSkill).toContain(phase);
    });
  }
});

// ---------------------------------------------------------------------------
// Light tier threshold consistency
// ---------------------------------------------------------------------------

describe("Light tier classification thresholds match SKILL.md", () => {
  it("1 file + 20 lines → light (matches SKILL.md '≤ 1 file AND ≤ 20 lines')", () => {
    const result = classifyTask(signals({ filesAffected: 1, linesChanged: 20 }));
    expect(result.tier).toBe("light");
  });

  it("2 files + 20 lines → NOT light (exceeds file threshold)", () => {
    const result = classifyTask(signals({ filesAffected: 2, linesChanged: 20 }));
    expect(result.tier).not.toBe("light");
  });

  it("1 file + 21 lines → NOT light (exceeds line threshold)", () => {
    const result = classifyTask(signals({ filesAffected: 1, linesChanged: 21 }));
    expect(result.tier).not.toBe("light");
  });

  it("SKILL.md documents the ≤1 file AND ≤20 lines condition", () => {
    // The SKILL.md should mention both thresholds
    expect(routerSkill).toMatch(/≤\s*1/);
    expect(routerSkill).toMatch(/≤\s*20/);
  });
});

// ---------------------------------------------------------------------------
// Full tier signal consistency
// ---------------------------------------------------------------------------

describe("Full tier signals match SKILL.md", () => {
  it("hasNewService → full", () => {
    const result = classifyTask(signals({ hasNewService: true }));
    expect(result.tier).toBe("full");
  });

  it("hasNewDatabase → full", () => {
    const result = classifyTask(signals({ hasNewDatabase: true }));
    expect(result.tier).toBe("full");
  });

  it("hasAuthChanges → full", () => {
    const result = classifyTask(signals({ hasAuthChanges: true }));
    expect(result.tier).toBe("full");
  });

  it("isVagueRequirement → full", () => {
    const result = classifyTask(signals({ isVagueRequirement: true }));
    expect(result.tier).toBe("full");
  });

  it("SKILL.md documents all four full-tier signals", () => {
    // Chinese terms used in SKILL.md
    expect(routerSkill).toContain("新服务");
    expect(routerSkill).toContain("新数据库");
    expect(routerSkill).toContain("认证");
    expect(routerSkill).toContain("模糊");
  });
});

// ---------------------------------------------------------------------------
// Standard tier signal consistency
// ---------------------------------------------------------------------------

describe("Standard tier signals match SKILL.md", () => {
  it("hasExistingSpec → standard", () => {
    const result = classifyTask(signals({ hasExistingSpec: true }));
    expect(result.tier).toBe("standard");
  });

  it("hasClearRequirements → standard", () => {
    const result = classifyTask(signals({ hasClearRequirements: true }));
    expect(result.tier).toBe("standard");
  });
});

// ---------------------------------------------------------------------------
// User override priority
// ---------------------------------------------------------------------------

describe("User override is highest priority (matches SKILL.md §4)", () => {
  it("user override to light wins over full signals", () => {
    const result = classifyTask(signals({ hasNewService: true }), "light");
    expect(result.tier).toBe("light");
  });

  it("user override to full wins over light signals", () => {
    const result = classifyTask(signals({ filesAffected: 1, linesChanged: 5 }), "full");
    expect(result.tier).toBe("full");
  });
});

// ---------------------------------------------------------------------------
// Command sequence structure consistency
// ---------------------------------------------------------------------------

describe("Command sequences match SKILL.md structure", () => {
  it("light sequence contains build-related and review phases", () => {
    const seq = getCommandSequence("light");
    expect(seq.some((s) => s.includes("build"))).toBe(true);
    expect(seq).toContain("review");
  });

  it("standard sequence contains plan, build, review, test, ship", () => {
    const seq = getCommandSequence("standard");
    expect(seq).toContain("plan");
    expect(seq.some((s) => s.includes("build"))).toBe(true);
    expect(seq).toContain("review");
    expect(seq).toContain("test");
    expect(seq).toContain("ship");
  });

  it("full sequence contains all standard phases plus learn", () => {
    const seq = getCommandSequence("full");
    expect(seq).toContain("plan");
    expect(seq.some((s) => s.includes("build"))).toBe(true);
    expect(seq).toContain("review");
    expect(seq).toContain("test");
    expect(seq).toContain("ship");
    expect(seq).toContain("learn");
  });

  it("CLAUDE.md documents the three command sequences", () => {
    // Light: build → review
    expect(claudeMd).toMatch(/build.*→.*review/i);
    // Standard: plan → build → review → test → ship
    expect(claudeMd).toMatch(/plan.*→.*build.*→.*review.*→.*test.*→.*ship/i);
  });
});

// ---------------------------------------------------------------------------
// work_nature field in router Status Update
// ---------------------------------------------------------------------------

describe("Router status update includes work_nature field", () => {
  it("router instructions mention work_nature in Status Update section", () => {
    expect(routerSkill).toContain("work_nature");
  });

  it("router instructions list valid work_nature values", () => {
    expect(routerSkill).toContain("feature/refactor/bugfix");
  });
});
