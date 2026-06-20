/**
 * T-11: Feature Spec E2E integration tests.
 * T-26: Bugfix Spec E2E integration tests.
 *
 * Validates end-to-end flows for the three-file spec system.
 */
import { describe, expect, it } from "vitest";
import { classify } from "../../src/conflict-classifier.js";
import { analyzeRequirements } from "../../src/spec-analyze.js";
import { detectBrownfieldSignals } from "../../src/spec-brownfield.js";
import { parseBugfixDesignMarkdown, parseBugfixMarkdown, renderBugfixDesignMarkdown, renderBugfixMarkdown, runBugfixSelfChecks, } from "../../src/spec-bugfix.js";
import { runBugfixOrchestration } from "../../src/spec-bugfix-orchestration.js";
import { computeBundleHash } from "../../src/spec-health.js";
import { parseExternalSpec, parseSpecArgs, scoreImportedContent } from "../../src/spec-import.js";
import { parseDesignMarkdown, parseRequirementsMarkdown } from "../../src/spec-parser.js";
import { derivePbtTasksFromUnchanged } from "../../src/spec-pbt-derivation.js";
import { detectLegacyPlanFallback, upgradeTasksSeed } from "../../src/spec-plan-upgrade.js";
import { refineDownstream } from "../../src/spec-refine.js";
import { renderDesignMarkdown, renderRequirementsMarkdown } from "../../src/spec-render.js";
import { buildReviewSpecContext } from "../../src/spec-review-router.js";
import { detectSpecLeakFromBundle as detectSpecLeak, enforceEarsSyntax, validateContractGate, } from "../../src/spec-validation.js";
import { resolveSpecVariant, scoreTaskDescription } from "../../src/spec-variant.js";
import { parseVariantOverride } from "../../src/spec-variant-override.js";
import { computeDependencyClosure } from "../../src/spec-wave.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFm(overrides = {}) {
    return {
        feature: "e2e-test",
        status: "locked",
        date: "2026-05-23",
        workflow_variant: "requirements-first",
        ...overrides,
    };
}
function makeEars(when, shall, verifyBy, evidence) {
    return {
        line: 1,
        when,
        shall,
        raw: `当 ${when} 时 系统应当 ${shall}`,
        ...(verifyBy ? { verifyBy: verifyBy } : {}),
        ...(evidence ? { evidence } : {}),
    };
}
// ---------------------------------------------------------------------------
// E2E 11.1: Requirements-First flow
// ---------------------------------------------------------------------------
describe("E2E: Requirements-First flow", () => {
    it("variant detection selects requirements-first for behavioral input", () => {
        const text = "用户应当能够登录系统，系统返回 token 给客户端";
        const score = scoreTaskDescription(text);
        expect(score.behaviorScore).toBeGreaterThan(0);
        const result = resolveSpecVariant({ tier: "Standard", ...score });
        expect(result.variant).toBe("requirements-first");
    });
    it("full requirements-first pipeline: parse → render → round-trip", () => {
        const reqMd = `---
feature: auth
status: draft
date: "2026-05-23"
workflow_variant: requirements-first
---

## Purpose
Auth system for login

## Glossary
| Term | Definition |
|------|-----------|
| JWT | JSON Web Token |

## Requirements
### Requirement 1: User Login

#### Acceptance Criteria
- 当 用户提交登录表单 时 系统应当 返回 JWT token [Verify-By: vitest] [Evidence: auth.test.ts]
- 当 密码错误 时 系统应当 返回 401 错误 [Verify-By: vitest] [Evidence: auth.test.ts]

## Non-Functional Requirements
Response time < 200ms

## Out of Scope
OAuth integration

## Delta
### Added
- Login endpoint

### Modified
- User model

### Unchanged
- Registration flow
`;
        const parsed = parseRequirementsMarkdown(reqMd);
        expect(parsed.doc).toBeDefined();
        expect(parsed.doc.earsCriteria).toHaveLength(2);
        expect(parsed.doc.earsCriteria[0].when).toContain("登录表单");
        // Round-trip
        const rendered = renderRequirementsMarkdown(parsed.doc);
        expect(rendered).toContain("## Requirements");
        expect(rendered).toContain("Acceptance Criteria");
    });
    it("analyze passes for valid EARS requirements with user stories", () => {
        const req = {
            frontmatter: makeFm(),
            intro: "Auth system",
            glossary: [],
            userStories: [
                {
                    title: "User Login",
                    description: "Users can log in",
                    earsCriteria: [
                        makeEars("用户登录", "返回 token", "vitest", "auth.test.ts"),
                        makeEars("密码错误", "返回 401", "vitest", "auth.test.ts"),
                    ],
                },
            ],
            earsCriteria: [
                makeEars("用户登录", "返回 token", "vitest", "auth.test.ts"),
                makeEars("密码错误", "返回 401", "vitest", "auth.test.ts"),
            ],
            nonFunctional: [],
            outOfScope: [],
        };
        const result = analyzeRequirements(req);
        expect(result.findings.filter((f) => f.severity === "P0")).toHaveLength(0);
    });
    it("contract gate passes for valid verifyBy/evidence", () => {
        const bundle = {
            feature: "auth",
            kind: "feature",
            layout: "three-file",
            variant: "requirements-first",
            primary: {
                frontmatter: makeFm(),
                intro: "",
                glossary: [],
                userStories: [],
                earsCriteria: [makeEars("用户登录", "返回 token", "vitest:unit", "auth.test.ts")],
                nonFunctional: [],
                outOfScope: [],
            },
        };
        const result = validateContractGate(bundle);
        expect(result.pass).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// E2E 11.2: Design-First flow
// ---------------------------------------------------------------------------
describe("E2E: Design-First flow", () => {
    it("variant detection selects design-first for architecture input", () => {
        const text = "微服务 数据库 缓存 中间件 队列 Postgres Redis Kafka gRPC microservice container deploy kubernetes serverless infrastructure";
        const score = scoreTaskDescription(text);
        const result = resolveSpecVariant({ tier: "Standard", ...score });
        expect(result.variant).toBe("design-first");
    });
    it("design markdown parse → render round-trip", () => {
        const designMd = `---
feature: auth
status: draft
date: "2026-05-23"
workflow_variant: design-first
---

## Overview
Auth microservice design

## Architecture
Event-driven microservice

## Component Interfaces
- AuthService: login/logout

## Data Model
User table with JWT fields

## Error Handling
400/401/500 error codes

## Testing Strategy
Unit + integration tests

## Rollout
Gradual rollout

## Open Questions
- Token expiry duration?
`;
        const parsed = parseDesignMarkdown(designMd);
        expect(parsed.doc).toBeDefined();
        expect(parsed.doc.overview).toContain("Auth microservice");
        const rendered = renderDesignMarkdown(parsed.doc);
        expect(rendered).toContain("## Architecture");
    });
});
// ---------------------------------------------------------------------------
// E2E 11.3: Quick Plan flow
// ---------------------------------------------------------------------------
describe("E2E: Quick Plan flow", () => {
    it("light tier routes to quick-plan", () => {
        const score = scoreTaskDescription("Fix typo");
        const result = resolveSpecVariant({ tier: "Light", ...score });
        expect(result.variant).toBe("quick-plan");
    });
});
// ---------------------------------------------------------------------------
// E2E 11.4: Auto Refine
// ---------------------------------------------------------------------------
describe("E2E: Auto Refine", () => {
    it("refine clears downstream when requirements change", () => {
        const bundle = {
            feature: "auth",
            kind: "feature",
            layout: "three-file",
            variant: "requirements-first",
            primary: {
                frontmatter: makeFm(),
                intro: "",
                glossary: [],
                userStories: [],
                earsCriteria: [],
                nonFunctional: [],
                outOfScope: [],
            },
            design: {
                frontmatter: makeFm({ status: "locked" }),
                overview: "old design",
                architecture: "",
                componentInterfaces: [],
                dataModel: "",
                errorHandling: "",
                testingStrategy: "",
                rollout: "",
                openQuestions: [],
            },
        };
        const result = refineDownstream(bundle, "design");
        expect(result.design).toBeUndefined();
    });
});
// ---------------------------------------------------------------------------
// E2E 11.5: Auto Migration
// ---------------------------------------------------------------------------
describe("E2E: Auto Migration (unit-level)", () => {
    it("legacy spec detected and classified correctly", () => {
        expect(classify(".forge/specs/auth/spec.md")).toBe("frozen");
        expect(classify(".forge/specs/auth/requirements.md")).toBe("frozen");
        expect(classify(".forge/specs/auth/spec.legacy.md")).toBe("open");
    });
});
// ---------------------------------------------------------------------------
// E2E 11.7: Chat-layer override
// ---------------------------------------------------------------------------
describe("E2E: Chat-layer variant override", () => {
    it("detects design-first override in Chinese", () => {
        const result = parseVariantOverride("切换到 design-first");
        expect(result).toBe("design-first");
    });
    it("detects quick plan override in English", () => {
        const result = parseVariantOverride("use quick plan instead");
        expect(result).toBe("quick-plan");
    });
    it("returns null for non-override text", () => {
        expect(parseVariantOverride("开始实现登录功能")).toBeNull();
    });
});
// ---------------------------------------------------------------------------
// E2E 11.8: Brownfield auto-detection
// ---------------------------------------------------------------------------
describe("E2E: Brownfield auto-detection", () => {
    it("detects brownfield from git history + keywords", () => {
        const signals = detectBrownfieldSignals({
            hasGitHistory: true,
            hasPriorSpec: true,
            taskDescription: "改造现有的登录模块",
        });
        expect(signals.brownfield).toBe(true);
    });
    it("no brownfield for greenfield project", () => {
        const signals = detectBrownfieldSignals({
            hasGitHistory: false,
            hasPriorSpec: false,
            taskDescription: "新建用户管理系统",
        });
        expect(signals.brownfield).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// E2E 11.9: External spec import
// ---------------------------------------------------------------------------
describe("E2E: External spec import", () => {
    it("parses external spec and scores content", () => {
        const external = `# Product Requirements

## Purpose
User management system

## Acceptance Criteria
- 当 用户注册 时 系统应当 创建账户
- 当 用户登录 时 系统应当 返回 token
`;
        const parsed = parseExternalSpec(external);
        expect(parsed.earsCriteria.length).toBeGreaterThan(0);
        const score = scoreImportedContent({
            earsCriteria: parsed.earsCriteria,
            hasArchitecture: /##\s*(?:Architecture|架构)/.test(external),
        });
        expect(score).toBeDefined();
    });
    it("parseSpecArgs detects file path for existing file", () => {
        // parseSpecArgs uses existsSync; provide a path that exists
        const args = parseSpecArgs(["package.json"]);
        expect(args.mode).toBe("import");
        expect(args.path).toBe("package.json");
    });
});
// ---------------------------------------------------------------------------
// E2E 11.10: Validation Contract & Spec Leak
// ---------------------------------------------------------------------------
describe("E2E: Validation Contract & Spec Leak", () => {
    it("contract gate blocks missing verifyBy", () => {
        const bundle = {
            feature: "test",
            kind: "feature",
            layout: "three-file",
            variant: "requirements-first",
            primary: {
                frontmatter: makeFm(),
                intro: "",
                glossary: [],
                userStories: [],
                earsCriteria: [
                    { line: 1, when: "登录", shall: "返回 token", raw: "当 登录 时 系统应当 返回 token" },
                ],
                nonFunctional: [],
                outOfScope: [],
            },
        };
        const result = validateContractGate(bundle);
        expect(result.pass).toBe(false);
    });
    it("spec leak returns structured result", () => {
        const bundle = {
            feature: "test",
            kind: "feature",
            layout: "three-file",
            variant: "requirements-first",
            primary: {
                frontmatter: makeFm(),
                intro: "Use AuthService to handle login",
                glossary: [],
                userStories: [],
                earsCriteria: [],
                nonFunctional: [],
                outOfScope: [],
            },
        };
        const result = detectSpecLeak(bundle, "strict");
        expect(result).toHaveProperty("leaked");
        expect(result).toHaveProperty("findings");
    });
});
// ---------------------------------------------------------------------------
// E2E 11.11: EARS enforcement
// ---------------------------------------------------------------------------
describe("E2E: EARS enforcement", () => {
    it("rewrites non-EARS arrow-style text into EARS format", () => {
        const result = enforceEarsSyntax("用户登录 → 返回 token", { maxRetries: 3 });
        expect(result.output).toContain("当");
        expect(result.output).toContain("系统应当");
        expect(result.exhausted).toBeFalsy();
    });
    it("marks unmatched non-EARS text exhausted (so ANL-01 can flag it)", () => {
        const result = enforceEarsSyntax("用户登录返回 token", { maxRetries: 3 });
        expect(result.exhausted).toBe(true);
        expect(result.output).toBe("用户登录返回 token");
    });
});
// ---------------------------------------------------------------------------
// E2E: Plan tasks.md single source
// ---------------------------------------------------------------------------
describe("E2E: Plan tasks.md single source", () => {
    it("upgradeTasksSeed generates waves from dependency graph", () => {
        const tasks = [
            {
                id: "T-01",
                title: "Setup",
                goal: "Setup project",
                related_requirements: [],
                status: "pending",
                depends_on: undefined,
            },
            {
                id: "T-02",
                title: "Login",
                goal: "Login endpoint",
                related_requirements: [],
                status: "pending",
                depends_on: ["T-01"],
            },
            {
                id: "T-03",
                title: "Tests",
                goal: "Write tests",
                related_requirements: [],
                status: "pending",
                depends_on: ["T-02"],
            },
        ];
        const doc = {
            frontmatter: makeFm({ status: "draft" }),
            tasks,
        };
        const result = upgradeTasksSeed(doc);
        expect(result.frontmatter.status).toBe("locked");
        expect(result.waves).toHaveLength(3);
    });
    it("detectLegacyPlanFallback for tasks.md + plans/ coexistence", () => {
        const result = detectLegacyPlanFallback({
            hasTasksMd: true,
            hasPlansMd: true,
            planContent: "---\n---\n# Old plan",
        });
        expect(result.coexistenceWarning).toBe(true);
        expect(result.needsFallback).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// E2E: Review spec context routing
// ---------------------------------------------------------------------------
describe("E2E: Review spec context routing", () => {
    it("three-file layout produces three references", () => {
        const bundle = {
            feature: "auth",
            kind: "feature",
            layout: "three-file",
            variant: "requirements-first",
            primary: {
                frontmatter: makeFm(),
                intro: "",
                glossary: [],
                userStories: [],
                earsCriteria: [makeEars("登录", "返回 token")],
                nonFunctional: [],
                outOfScope: [],
            },
            design: {
                frontmatter: makeFm(),
                overview: "",
                architecture: "",
                componentInterfaces: [],
                dataModel: "",
                errorHandling: "",
                testingStrategy: "",
                rollout: "",
                openQuestions: [],
            },
            tasks: {
                frontmatter: makeFm(),
                tasks: [
                    {
                        id: "T-01",
                        title: "Login",
                        goal: "Do it",
                        related_requirements: [],
                        status: "pending",
                    },
                ],
            },
        };
        const ctx = buildReviewSpecContext(bundle);
        expect(ctx.specReferences).toHaveLength(3);
        expect(ctx.earsCriteria).toHaveLength(1);
        expect(ctx.taskIds).toContain("T-01");
    });
});
// ---------------------------------------------------------------------------
// E2E: Wave scheduling
// ---------------------------------------------------------------------------
describe("E2E: Wave scheduling", () => {
    it("computeDependencyClosure returns transitive deps", () => {
        const tasks = [
            { id: "T-01", title: "A", goal: "a", related_requirements: [], status: "pending" },
            {
                id: "T-02",
                title: "B",
                goal: "b",
                related_requirements: [],
                status: "pending",
                depends_on: ["T-01"],
            },
            {
                id: "T-03",
                title: "C",
                goal: "c",
                related_requirements: [],
                status: "pending",
                depends_on: ["T-02"],
            },
        ];
        const closure = computeDependencyClosure("T-03", tasks);
        expect(closure.sort()).toEqual(["T-01", "T-02", "T-03"]);
    });
});
// ---------------------------------------------------------------------------
// E2E: Health check bundle hash
// ---------------------------------------------------------------------------
describe("E2E: Health check bundle hash", () => {
    it("three-file hash is stable", () => {
        const threeFile = {
            feature: "auth",
            kind: "feature",
            layout: "three-file",
            variant: "requirements-first",
            primary: {
                frontmatter: makeFm(),
                intro: "Auth",
                glossary: [],
                userStories: [],
                earsCriteria: [],
                nonFunctional: [],
                outOfScope: [],
            },
            design: {
                frontmatter: makeFm(),
                overview: "Design",
                architecture: "",
                componentInterfaces: [],
                dataModel: "",
                errorHandling: "",
                testingStrategy: "",
                rollout: "",
                openQuestions: [],
            },
        };
        const legacy = {
            feature: "auth",
            kind: "feature",
            layout: "legacy-single",
            variant: "requirements-first",
            primary: {
                frontmatter: makeFm(),
                intro: "Auth",
                glossary: [],
                userStories: [],
                earsCriteria: [],
                nonFunctional: [],
                outOfScope: [],
            },
        };
        expect(computeBundleHash(threeFile)).toBe(computeBundleHash(threeFile));
        // three-file with design should differ from legacy (no design)
        expect(computeBundleHash(threeFile)).not.toBe(computeBundleHash(legacy));
    });
});
// ---------------------------------------------------------------------------
// T-26 E2E: Bugfix Spec full flow
// ---------------------------------------------------------------------------
describe("T-26 E2E: Bugfix Spec full flow", () => {
    it("complete bugfix pipeline: parse → orchestration → PBT derivation → self-check", () => {
        const bugfixMd = `---
feature: login-crash
status: locked
date: "2026-05-23"
workflow_variant: requirements-first
kind: bugfix
---

# Bugfix: Login Crash

## Current Behavior
- 当 用户提交登录表单 时 系统应当 返回 500 错误

## Expected Behavior
- 当 用户提交登录表单 时 系统应当 返回 200 并创建会话

## Unchanged Behavior
- 当 用户提交注册表单 时 系统应当 创建账户
- 当 用户登出 时 系统应当 清除 session
`;
        // Step 1: Parse bugfix
        const parsed = parseBugfixMarkdown(bugfixMd);
        expect(parsed.doc).toBeDefined();
        expect(parsed.doc.current).toHaveLength(1);
        expect(parsed.doc.expected).toHaveLength(1);
        expect(parsed.doc.unchanged).toHaveLength(2);
        // Step 2: Build bundle and orchestrate
        const bundle = {
            feature: "login-crash",
            kind: "bugfix",
            layout: "three-file",
            variant: "requirements-first",
            primary: parsed.doc,
        };
        const orchestration = runBugfixOrchestration(bundle);
        expect(orchestration.steps).toHaveLength(3);
        expect(orchestration.variantDetection).toBe(false);
        expect(orchestration.specLeakMode).toBe("lenient");
        // Step 3: PBT derivation
        const pbtTasks = derivePbtTasksFromUnchanged(bundle);
        expect(pbtTasks).toHaveLength(2);
        expect(pbtTasks.every((t) => t.category === "regression-test")).toBe(true);
        expect(pbtTasks.every((t) => t.verification === "pbt")).toBe(true);
        // Step 4: Round-trip render
        const rendered = renderBugfixMarkdown(parsed.doc);
        expect(rendered).toContain("Current Behavior");
        expect(rendered).toContain("Expected Behavior");
        expect(rendered).toContain("Unchanged Behavior");
        // Step 5: Self-checks (BFX-01~06)
        const selfChecks = runBugfixSelfChecks(bundle);
        expect(selfChecks.pass).toBe(true);
    });
    it("bugfix self-check detects missing sections (BFX-01)", () => {
        const bundle = {
            feature: "bad-bugfix",
            kind: "bugfix",
            layout: "three-file",
            variant: "requirements-first",
            primary: {
                frontmatter: { ...makeFm(), kind: "bugfix" },
                current: [],
                expected: [],
                unchanged: [],
            },
        };
        const result = runBugfixSelfChecks(bundle);
        expect(result.pass).toBe(false);
        expect(result.findings.some((f) => f.rule === "BFX-01")).toBe(true);
    });
    it("bugfix design round-trip", () => {
        const designMd = `---
feature: login-crash
status: locked
date: "2026-05-23"
workflow_variant: requirements-first
kind: bugfix
---

# Bugfix Design

## Root Cause Analysis
Null pointer in auth handler

## Fix Strategy
Add null check before token generation

## Test Properties
- 当 用户提交登录表单 时 系统应当 返回 200
`;
        const parsed = parseBugfixDesignMarkdown(designMd);
        expect(parsed.doc).toBeDefined();
        expect(parsed.doc.rootCause).toContain("Null pointer");
        const rendered = renderBugfixDesignMarkdown(parsed.doc);
        expect(rendered).toContain("Root Cause Analysis");
    });
    it("frozen zone covers bugfix.md", () => {
        expect(classify(".forge/specs/auth/bugfix.md")).toBe("frozen");
    });
});
//# sourceMappingURL=spec-kiro-style.test.js.map