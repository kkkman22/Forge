/**
 * T-24: /tinkerman fix Bugfix orchestration.
 *
 * Validates: Requirement 14
 */
import { describe, expect, it } from "vitest";
import { runBugfixOrchestration } from "../src/spec-bugfix-orchestration.js";
import type {
  BugfixDesignDocument,
  BugfixDocument,
  SpecBundle,
  SpecFileFrontmatter,
  TasksSeedDocument,
} from "../src/spec-bundle.js";

function makeBugfixBundle(): SpecBundle {
  const fm: SpecFileFrontmatter = {
    feature: "login-crash",
    status: "locked",
    date: "2026-05-23",
    workflow_variant: "requirements-first",
    kind: "bugfix",
  };
  const doc: BugfixDocument = {
    frontmatter: { ...fm, kind: "bugfix" },
    current: [
      {
        line: 1,
        when: "用户提交登录表单",
        shall: "系统返回 500 错误",
        raw: "当 用户提交登录表单 时 系统应当 系统返回 500 错误",
      },
    ],
    expected: [
      {
        line: 1,
        when: "用户提交登录表单",
        shall: "系统返回 200 并创建会话",
        raw: "当 用户提交登录表单 时 系统应当 系统返回 200 并创建会话",
      },
    ],
    unchanged: [
      {
        line: 1,
        when: "用户提交注册表单",
        shall: "系统创建账户",
        raw: "当 用户提交注册表单 时 系统应当 系统创建账户",
      },
      {
        line: 2,
        when: "用户登出",
        shall: "系统清除会话",
        raw: "当 用户登出 时 系统应当 系统清除会话",
      },
    ],
  };
  return {
    feature: "login-crash",
    kind: "bugfix",
    layout: "three-file",
    variant: "requirements-first",
    primary: doc,
  };
}

describe("runBugfixOrchestration", () => {
  it("returns orchestration steps in order: bugfix → design → tasks", () => {
    const bundle = makeBugfixBundle();
    const result = runBugfixOrchestration(bundle);

    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].phase).toBe("bugfix");
    expect(result.steps[1].phase).toBe("design");
    expect(result.steps[2].phase).toBe("tasks");
  });

  it("generates design document from bugfix bundle", () => {
    const bundle = makeBugfixBundle();
    const result = runBugfixOrchestration(bundle);

    const designStep = result.steps[1];
    expect(designStep.phase).toBe("design");
    expect(designStep.document).toBeDefined();
    const design = designStep.document as BugfixDesignDocument;
    expect(design.rootCause).toBeTruthy();
    expect(design.fixStrategy).toBeTruthy();
    expect(design.testProperties).toBeTruthy();
  });

  it("generates tasks document with PBT-derived tasks from unchanged", () => {
    const bundle = makeBugfixBundle();
    const result = runBugfixOrchestration(bundle);

    const tasksStep = result.steps[2];
    expect(tasksStep.phase).toBe("tasks");
    const tasks = tasksStep.document as TasksSeedDocument;
    // Should have fix tasks + PBT regression tasks
    expect(tasks.tasks.length).toBeGreaterThan(0);

    const regressionTasks = tasks.tasks.filter((t) => t.category === "regression-test");
    expect(regressionTasks.length).toBeGreaterThan(0);
  });

  it("skips variant/brownfield detection (bugfix-specific)", () => {
    const bundle = makeBugfixBundle();
    const result = runBugfixOrchestration(bundle);

    expect(result.variantDetection).toBe(false);
    expect(result.brownfieldDetection).toBe(false);
  });

  it("preserves spec leak check in lenient mode", () => {
    const bundle = makeBugfixBundle();
    const result = runBugfixOrchestration(bundle);

    expect(result.specLeakMode).toBe("lenient");
  });

  it("returns empty steps for non-bugfix bundle", () => {
    const bundle: SpecBundle = {
      feature: "test",
      kind: "feature",
      layout: "three-file",
      variant: "requirements-first",
      primary: {
        frontmatter: {
          feature: "test",
          status: "locked",
          date: "2026-05-23",
          workflow_variant: "requirements-first",
        },
        intro: "",
        glossary: [],
        userStories: [],
        earsCriteria: [],
        nonFunctional: [],
        outOfScope: [],
      },
    };

    const result = runBugfixOrchestration(bundle);
    expect(result.steps).toHaveLength(0);
  });
});
