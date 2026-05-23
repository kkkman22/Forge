/**
 * Plan tasks.md lock flow — lockPlan wiring test.
 */
import { describe, expect, it } from "vitest";
import { lockPlan } from "../src/plan.js";
import type { TasksSeedDocument, SpecFileFrontmatter } from "../src/spec-bundle.js";

function makeFm(): SpecFileFrontmatter {
  return { feature: "test", status: "draft", date: "2026-05-23", workflow_variant: "requirements-first" };
}

describe("lockPlan", () => {
  it("upgrades and locks a draft TasksSeedDocument", () => {
    const doc: TasksSeedDocument = {
      frontmatter: makeFm(),
      tasks: [
        { id: "T-01", title: "Do something", goal: "Implement it", related_requirements: ["R1"], status: "pending" },
        { id: "T-02", title: "Do more", goal: "More implementation", related_requirements: ["R2"], status: "pending", depends_on: ["T-01"] },
      ],
    };

    const result = lockPlan(doc);
    expect(result.frontmatter.status).toBe("locked");
    // upgradeTasksSeed should have generated wave blocks
    expect(result.tasks).toHaveLength(2);
  });

  it("preserves existing locked document", () => {
    const doc: TasksSeedDocument = {
      frontmatter: { ...makeFm(), status: "locked" },
      tasks: [],
    };
    const result = lockPlan(doc);
    expect(result.frontmatter.status).toBe("locked");
  });
});
