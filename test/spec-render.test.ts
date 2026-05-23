/**
 * T-05: Three-file generator (renderer) round-trip tests.
 *
 * render → parse → verify content preserved.
 *
 * Validates: Requirement 1
 */
import { describe, expect, it } from "vitest";
import {
  renderRequirementsMarkdown,
  renderDesignMarkdown,
  renderTasksMarkdown,
} from "../src/spec-render.js";
import {
  parseRequirementsMarkdown,
  parseDesignMarkdown,
  parseTasksMarkdown,
} from "../src/spec-parser.js";
import type {
  RequirementsDocument,
  DesignDocument,
  TasksSeedDocument,
  SpecFileFrontmatter,
} from "../src/spec-bundle.js";

function makeFrontmatter(overrides?: Partial<SpecFileFrontmatter>): SpecFileFrontmatter {
  return {
    feature: "roundtrip-test",
    status: "draft",
    date: "2026-05-23",
    workflow_variant: "requirements-first",
    ...overrides,
  };
}

describe("renderRequirementsMarkdown round-trip", () => {
  it("preserves frontmatter and intro", () => {
    const doc: RequirementsDocument = {
      frontmatter: makeFrontmatter(),
      intro: "Test introduction with special chars: <>&\"'",
      glossary: [],
      userStories: [],
      earsCriteria: [],
      nonFunctional: ["NFR1: performance"],
      outOfScope: ["Not doing X"],
    };

    const md = renderRequirementsMarkdown(doc);
    const result = parseRequirementsMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.frontmatter.feature).toBe("roundtrip-test");
    expect(result.doc!.intro).toBe(doc.intro);
    expect(result.doc!.nonFunctional).toContain("NFR1: performance");
    expect(result.doc!.outOfScope).toContain("Not doing X");
  });

  it("preserves EARS criteria", () => {
    const doc: RequirementsDocument = {
      frontmatter: makeFrontmatter(),
      intro: "",
      glossary: [],
      userStories: [
        {
          title: "US1",
          description: "Story",
          earsCriteria: [
            { line: 1, when: "用户点击提交", shall: "系统保存数据", raw: "当 用户点击提交 时 系统应当 系统保存数据" },
          ],
        },
      ],
      earsCriteria: [],
      nonFunctional: [],
      outOfScope: [],
    };

    const md = renderRequirementsMarkdown(doc);
    const result = parseRequirementsMarkdown(md);
    expect(result.doc!.earsCriteria).toHaveLength(1);
    expect(result.doc!.earsCriteria[0].when).toBe("用户点击提交");
    expect(result.doc!.earsCriteria[0].shall).toBe("系统保存数据");
  });

  it("preserves delta section", () => {
    const doc: RequirementsDocument = {
      frontmatter: makeFrontmatter(),
      intro: "",
      glossary: [],
      userStories: [],
      earsCriteria: [],
      nonFunctional: [],
      outOfScope: [],
      delta: { added: ["a.ts"], modified: ["b.ts"], unchanged: ["c.ts"] },
    };

    const md = renderRequirementsMarkdown(doc);
    const result = parseRequirementsMarkdown(md);
    expect(result.doc!.delta).toBeDefined();
    expect(result.doc!.delta!.added).toContain("a.ts");
    expect(result.doc!.delta!.modified).toContain("b.ts");
    expect(result.doc!.delta!.unchanged).toContain("c.ts");
  });
});

describe("renderDesignMarkdown round-trip", () => {
  it("preserves overview and architecture", () => {
    const doc: DesignDocument = {
      frontmatter: makeFrontmatter(),
      overview: "Design overview text",
      architecture: "Architecture description",
      componentInterfaces: ["Comp A: does X"],
      dataModel: "Data model desc",
      errorHandling: "Error handling",
      testingStrategy: "Testing strategy",
      rollout: "Rollout plan",
      openQuestions: ["Q1?"],
    };

    const md = renderDesignMarkdown(doc);
    const result = parseDesignMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.overview).toBe("Design overview text");
    expect(result.doc!.architecture).toBe("Architecture description");
  });

  it("preserves brownfield fields", () => {
    const doc: DesignDocument = {
      frontmatter: makeFrontmatter(),
      overview: "Overview",
      architecture: "Arch",
      componentInterfaces: [],
      dataModel: "",
      errorHandling: "",
      testingStrategy: "",
      rollout: "",
      openQuestions: [],
      currentState: "file:line refs",
      proposedChange: "change points",
      reversibility: "rollback plan",
    };

    const md = renderDesignMarkdown(doc);
    const result = parseDesignMarkdown(md);
    expect(result.doc!.currentState).toContain("file:line");
    expect(result.doc!.proposedChange).toContain("change points");
    expect(result.doc!.reversibility).toContain("rollback");
  });
});

describe("renderTasksMarkdown round-trip", () => {
  it("preserves task list", () => {
    const doc: TasksSeedDocument = {
      frontmatter: makeFrontmatter(),
      tasks: [
        { id: "T-01", title: "First", goal: "Do A", related_requirements: ["R1"], status: "pending" },
        { id: "T-02", title: "Second", goal: "Do B", related_requirements: [], status: "pending", depends_on: ["T-01"] },
      ],
    };

    const md = renderTasksMarkdown(doc);
    const result = parseTasksMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.tasks).toHaveLength(2);
    expect(result.doc!.tasks[0].id).toBe("T-01");
    expect(result.doc!.tasks[1].depends_on).toContain("T-01");
  });

  it("preserves waves", () => {
    const doc: TasksSeedDocument = {
      frontmatter: makeFrontmatter(),
      tasks: [
        { id: "T-01", title: "First", goal: "A", related_requirements: [], status: "pending" },
      ],
      waves: [{ wave: 1, tasks: ["T-01"] }],
    };

    const md = renderTasksMarkdown(doc);
    const result = parseTasksMarkdown(md);
    expect(result.doc!.waves).toHaveLength(1);
    expect(result.doc!.waves![0].tasks).toContain("T-01");
  });
});
