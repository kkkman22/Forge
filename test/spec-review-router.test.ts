/**
 * T-09.3: Review subagent input routing.
 *
 * Validates: Requirement 6 — review reads spec via loadSpecBundle
 */
import { describe, expect, it } from "vitest";
import type {
  BugfixDocument,
  DesignDocument,
  RequirementsDocument,
  SpecBundle,
  SpecFileFrontmatter,
  TasksSeedDocument,
} from "../src/spec-bundle.js";
import { buildReviewSpecContext } from "../src/spec-review-router.js";

function makeFeatureBundle(): SpecBundle {
  const fm: SpecFileFrontmatter = {
    feature: "auth",
    status: "locked",
    date: "2026-05-23",
    workflow_variant: "requirements-first",
  };
  return {
    feature: "auth",
    kind: "feature",
    layout: "three-file",
    variant: "requirements-first",
    primary: {
      frontmatter: fm,
      intro: "Auth system",
      glossary: [{ term: "JWT", definition: "JSON Web Token" }],
      userStories: [],
      earsCriteria: [
        {
          line: 1,
          when: "用户登录",
          shall: "返回 token",
          raw: "当 用户登录 时 系统应当 返回 token",
        },
      ],
      nonFunctional: [],
      outOfScope: [],
    } as RequirementsDocument,
    design: {
      frontmatter: fm,
      overview: "Auth overview",
      architecture: "microservice",
      componentInterfaces: [],
      dataModel: "User table",
      errorHandling: "400/401/500",
      testingStrategy: "unit + integration",
      rollout: "gradual",
      openQuestions: [],
    } as DesignDocument,
    tasks: {
      frontmatter: fm,
      tasks: [
        {
          id: "T-01",
          title: "Implement login",
          goal: "Login endpoint",
          related_requirements: [],
          status: "pending",
        },
      ],
    } as TasksSeedDocument,
  };
}

function makeLegacyBundle(): SpecBundle {
  const fm: SpecFileFrontmatter = {
    feature: "auth",
    status: "locked",
    date: "2026-05-23",
    workflow_variant: "requirements-first",
  };
  return {
    feature: "auth",
    kind: "feature",
    layout: "legacy-single",
    variant: "requirements-first",
    primary: {
      frontmatter: fm,
      intro: "Auth system",
      glossary: [],
      userStories: [],
      earsCriteria: [],
      nonFunctional: [],
      outOfScope: [],
    } as RequirementsDocument,
  };
}

function makeBugfixBundle(): SpecBundle {
  const fm: SpecFileFrontmatter = {
    feature: "login-crash",
    status: "locked",
    date: "2026-05-23",
    workflow_variant: "requirements-first",
    kind: "bugfix",
  };
  return {
    feature: "login-crash",
    kind: "bugfix",
    layout: "three-file",
    variant: "requirements-first",
    primary: {
      frontmatter: { ...fm, kind: "bugfix" },
      current: [{ line: 1, when: "登录", shall: "500错误", raw: "当 登录 时 系统应当 500错误" }],
      expected: [{ line: 1, when: "登录", shall: "200 OK", raw: "当 登录 时 系统应当 200 OK" }],
      unchanged: [
        { line: 1, when: "注册", shall: "创建账户", raw: "当 注册 时 系统应当 创建账户" },
      ],
    } as BugfixDocument,
  };
}

describe("buildReviewSpecContext", () => {
  it("three-file layout references requirements/design/tasks separately", () => {
    const bundle = makeFeatureBundle();
    const ctx = buildReviewSpecContext(bundle);

    expect(ctx.layout).toBe("three-file");
    expect(ctx.specReferences).toHaveLength(3);
    expect(ctx.specReferences[0].file).toBe("requirements.md");
    expect(ctx.specReferences[1].file).toBe("design.md");
    expect(ctx.specReferences[2].file).toBe("tasks.md");
  });

  it("legacy-single layout references single spec.md", () => {
    const bundle = makeLegacyBundle();
    const ctx = buildReviewSpecContext(bundle);

    expect(ctx.layout).toBe("legacy-single");
    expect(ctx.specReferences).toHaveLength(1);
    expect(ctx.specReferences[0].file).toBe("spec.md");
  });

  it("bugfix layout references bugfix/design/tasks", () => {
    const bundle = makeBugfixBundle();
    const ctx = buildReviewSpecContext(bundle);

    expect(ctx.kind).toBe("bugfix");
    expect(ctx.specReferences[0].file).toBe("bugfix.md");
  });

  it("includes EARS criteria for spec-check layer", () => {
    const bundle = makeFeatureBundle();
    const ctx = buildReviewSpecContext(bundle);

    expect(ctx.earsCriteria).toHaveLength(1);
    expect(ctx.earsCriteria[0].when).toBe("用户登录");
  });

  it("includes task IDs for scope creep detection", () => {
    const bundle = makeFeatureBundle();
    const ctx = buildReviewSpecContext(bundle);

    expect(ctx.taskIds).toContain("T-01");
  });

  it("generates prompt injection snippet for three-file", () => {
    const bundle = makeFeatureBundle();
    const ctx = buildReviewSpecContext(bundle);

    expect(ctx.promptSnippet).toContain("requirements.md");
    expect(ctx.promptSnippet).toContain("design.md");
    expect(ctx.promptSnippet).toContain("tasks.md");
  });
});
