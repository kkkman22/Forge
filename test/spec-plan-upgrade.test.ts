/**
 * T-09.4: Plan stage — tasks.md single source upgrade.
 *
 * Validates: Requirement 4, 7
 */
import { describe, expect, it } from "vitest";
import type { SpecFileFrontmatter, TaskSeed, TasksSeedDocument, Wave } from "../src/spec-bundle.js";
import { detectLegacyPlanFallback, upgradeTasksSeed } from "../src/spec-plan-upgrade.js";

function makeFm(): SpecFileFrontmatter {
  return {
    feature: "auth",
    status: "draft",
    date: "2026-05-23",
    workflow_variant: "requirements-first",
  };
}

function makeTaskSeed(overrides: Partial<TaskSeed> = {}): TaskSeed {
  return {
    id: "T-01",
    title: "Implement login",
    goal: "Create login endpoint",
    related_requirements: [],
    status: "pending",
    ...overrides,
  };
}

describe("upgradeTasksSeed", () => {
  it("upgrades draft tasks to locked with wave blocks", () => {
    const tasks: TaskSeed[] = [
      makeTaskSeed({ id: "T-01", depends_on: undefined }),
      makeTaskSeed({ id: "T-02", depends_on: ["T-01"] }),
      makeTaskSeed({ id: "T-03", depends_on: ["T-01"] }),
    ];
    const doc: TasksSeedDocument = {
      frontmatter: makeFm(),
      tasks,
    };

    const result = upgradeTasksSeed(doc);

    expect(result.frontmatter.status).toBe("locked");
    expect(result.tasks).toHaveLength(3);
    expect(result.waves).toBeDefined();
    expect(result.waves!.length).toBeGreaterThan(0);
  });

  it("generates wave blocks from dependency graph", () => {
    const tasks: TaskSeed[] = [
      makeTaskSeed({ id: "T-01", depends_on: undefined }),
      makeTaskSeed({ id: "T-02", depends_on: ["T-01"] }),
      makeTaskSeed({ id: "T-03", depends_on: ["T-02"] }),
    ];
    const doc: TasksSeedDocument = { frontmatter: makeFm(), tasks };

    const result = upgradeTasksSeed(doc);

    // T-01 in wave 1, T-02 in wave 2, T-03 in wave 3
    expect(result.waves).toHaveLength(3);
    expect(result.waves![0].tasks).toContain("T-01");
    expect(result.waves![1].tasks).toContain("T-02");
    expect(result.waves![2].tasks).toContain("T-03");
  });

  it("groups independent tasks in same wave", () => {
    const tasks: TaskSeed[] = [
      makeTaskSeed({ id: "T-01", depends_on: undefined }),
      makeTaskSeed({ id: "T-02", depends_on: undefined }),
      makeTaskSeed({ id: "T-03", depends_on: ["T-01", "T-02"] }),
    ];
    const doc: TasksSeedDocument = { frontmatter: makeFm(), tasks };

    const result = upgradeTasksSeed(doc);

    // T-01 and T-02 in wave 1, T-03 in wave 2
    expect(result.waves).toHaveLength(2);
    expect(result.waves![0].tasks).toEqual(expect.arrayContaining(["T-01", "T-02"]));
    expect(result.waves![1].tasks).toContain("T-03");
  });

  it("fills in missing task fields with defaults", () => {
    const tasks: TaskSeed[] = [
      {
        id: "T-01",
        title: "Do something",
        goal: "Implement it",
        related_requirements: [],
        status: "pending",
      },
    ];
    const doc: TasksSeedDocument = { frontmatter: makeFm(), tasks };

    const result = upgradeTasksSeed(doc);

    expect(result.tasks[0].status).toBe("pending");
    expect(result.tasks[0].category).toBe("implementation");
    expect(result.tasks[0].verification).toBe("auto");
  });

  it("preserves existing wave blocks if present", () => {
    const existingWaves: Wave[] = [
      { wave: 1, tasks: ["T-01"] },
      { wave: 2, tasks: ["T-02"] },
    ];
    const doc: TasksSeedDocument = {
      frontmatter: makeFm(),
      tasks: [makeTaskSeed(), makeTaskSeed({ id: "T-02", depends_on: ["T-01"] })],
      waves: existingWaves,
    };

    const result = upgradeTasksSeed(doc);

    expect(result.waves).toEqual(existingWaves);
  });

  it("marks already-locked doc as no-op", () => {
    const doc: TasksSeedDocument = {
      frontmatter: { ...makeFm(), status: "locked" },
      tasks: [makeTaskSeed()],
    };

    const result = upgradeTasksSeed(doc);

    expect(result.frontmatter.status).toBe("locked");
  });
});

describe("detectLegacyPlanFallback", () => {
  it("returns fallback info when tasks.md absent but plans/ exists", () => {
    const result = detectLegacyPlanFallback({
      hasTasksMd: false,
      hasPlansMd: true,
      planContent: "---\nstatus: approved\n---\n# Plan\n\n## Tasks\n\n### Task 1: Login\n",
    });

    expect(result.needsFallback).toBe(true);
    expect(result.source).toBe("plans");
  });

  it("returns no fallback when tasks.md exists", () => {
    const result = detectLegacyPlanFallback({
      hasTasksMd: true,
      hasPlansMd: true,
      planContent: "",
    });

    expect(result.needsFallback).toBe(false);
  });

  it("returns no fallback when neither exists", () => {
    const result = detectLegacyPlanFallback({
      hasTasksMd: false,
      hasPlansMd: false,
      planContent: "",
    });

    expect(result.needsFallback).toBe(false);
  });

  it("flags coexistence as P2 warning", () => {
    const result = detectLegacyPlanFallback({
      hasTasksMd: true,
      hasPlansMd: true,
      planContent: "---\n---\n# Old plan\n",
    });

    expect(result.coexistenceWarning).toBe(true);
  });
});
