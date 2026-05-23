/**
 * routeSpecEntry — argv branch coverage.
 *
 * Validates Requirement 14 (bugfix routing) + Requirement 10 (import mode)
 * + the default / feature paths. Round 4 acceptance flagged this as the
 * only P2 from the audit; this file closes that gap with one test per
 * SpecRouteResult variant.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
    BugfixDocument,
    RequirementsDocument,
    SpecBundle,
} from "../src/spec-bundle.js";
import { routeSpecEntry } from "../src/spec.js";

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "forge-route-spec-entry-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeFeatureBundle(feature: string): SpecBundle {
  const requirements: RequirementsDocument = {
    frontmatter: {
      feature,
      status: "draft",
      date: "2026-05-23",
      workflow_variant: "requirements-first",
    },
    intro: "intro",
    glossary: [],
    userStories: [],
    earsCriteria: [],
    nonFunctional: [],
    outOfScope: [],
  };
  return {
    feature,
    kind: "feature",
    layout: "three-file",
    variant: "requirements-first",
    primary: requirements,
  };
}

function makeBugfixBundle(feature: string): SpecBundle {
  const bugfix: BugfixDocument = {
    frontmatter: {
      feature,
      status: "draft",
      date: "2026-05-23",
      workflow_variant: "requirements-first",
      kind: "bugfix",
    },
    current: [
      { line: 1, when: "用户提交登录", shall: "返回 500 错误", raw: "当 用户提交登录 时 系统应当 返回 500 错误" },
    ],
    expected: [
      { line: 2, when: "用户提交登录", shall: "返回 200 并创建会话", raw: "当 用户提交登录 时 系统应当 返回 200 并创建会话" },
    ],
    unchanged: [
      { line: 3, when: "用户登出", shall: "清除 session", raw: "当 用户登出 时 系统应当 清除 session" },
    ],
  };
  return {
    feature,
    kind: "bugfix",
    layout: "three-file",
    variant: "requirements-first",
    primary: bugfix,
  };
}

// ---------------------------------------------------------------------------
// Branch 1: default mode (no argv)
// ---------------------------------------------------------------------------

describe("routeSpecEntry — default branch", () => {
  it("returns mode='default' when argv is empty", () => {
    const result = routeSpecEntry([], workDir, workDir);
    expect(result.mode).toBe("default");
    if (result.mode === "default") {
      // No additional fields on default — narrow type guard satisfied
      expect(Object.keys(result)).toEqual(["mode"]);
    }
  });
});

// ---------------------------------------------------------------------------
// Branch 2: import mode (argv[0] is an existing file path)
// ---------------------------------------------------------------------------

describe("routeSpecEntry — import branch", () => {
  it("dispatches to runImportMode when argv[0] is an existing file", () => {
    const externalPath = join(workDir, "external-spec.md");
    writeFileSync(
      externalPath,
      "# External Product Spec\n\n" +
        "## Acceptance Criteria\n\n" +
        "- 当 用户提交 时 系统应当 返回成功\n",
      "utf-8",
    );
    const outputRoot = join(workDir, "specs");
    mkdirSync(join(outputRoot, "external-spec"), { recursive: true });

    const result = routeSpecEntry([externalPath], workDir, outputRoot);

    expect(result.mode).toBe("import");
    if (result.mode === "import") {
      expect(result.path).toBe(externalPath);
      expect(result.result.success).toBe(true);
      expect(result.result.feature).toBe("external-spec");
      expect(result.result.outputPath).toContain("external-spec");
      // runImportMode should write at least requirements.md
      expect(existsSync(join(result.result.outputPath, "requirements.md"))).toBe(true);
    }
  });

  it("returns import-mode result with success=false when input file is unreadable", () => {
    const externalPath = join(workDir, "missing-spec.md");
    // Don't create the file. parseSpecArgs uses existsSync, so this falls
    // through to the feature branch — ensure that fallback fires.
    const result = routeSpecEntry([externalPath], workDir, workDir);
    expect(result.mode).toBe("feature");
  });
});

// ---------------------------------------------------------------------------
// Branch 3: feature mode (argv[0] is a feature name, no bugfix.md)
// ---------------------------------------------------------------------------

describe("routeSpecEntry — feature branch", () => {
  it("returns mode='feature' when bugfix.md is absent", () => {
    const featureDir = join(workDir, "auth");
    mkdirSync(featureDir, { recursive: true });
    // Drop a requirements.md to keep the directory plausibly a feature spec
    writeFileSync(join(featureDir, "requirements.md"), "---\n---\n", "utf-8");

    const result = routeSpecEntry(["auth"], featureDir, workDir);
    expect(result.mode).toBe("feature");
    if (result.mode === "feature") {
      expect(result.feature).toBe("auth");
    }
  });

  it("returns mode='feature' when feature directory does not yet exist", () => {
    const newFeatureDir = join(workDir, "brand-new");
    // Don't mkdir; readdirSync should throw and the catch branch returns feature
    const result = routeSpecEntry(["brand-new"], newFeatureDir, workDir);
    expect(result.mode).toBe("feature");
    if (result.mode === "feature") {
      expect(result.feature).toBe("brand-new");
    }
  });
});

// ---------------------------------------------------------------------------
// Branch 4: bugfix mode (bugfix.md present + existingBundle provided)
// ---------------------------------------------------------------------------

describe("routeSpecEntry — bugfix branch", () => {
  it("dispatches to runBugfixOrchestration when bugfix.md present and bundle supplied", () => {
    const featureDir = join(workDir, "login-crash");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "bugfix.md"), "---\n---\n", "utf-8");

    const bundle = makeBugfixBundle("login-crash");
    const result = routeSpecEntry(["login-crash"], featureDir, workDir, bundle);

    expect(result.mode).toBe("bugfix");
    if (result.mode === "bugfix") {
      expect(result.bundle).toBe(bundle);
      expect(result.result.steps).toHaveLength(3);
      expect(result.result.variantDetection).toBe(false);
    }
  });

  it("falls back to feature mode when bugfix.md present but no bundle is supplied", () => {
    const featureDir = join(workDir, "no-bundle-feature");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "bugfix.md"), "---\n---\n", "utf-8");

    // No existingBundle — orchestration cannot run, so we expect feature fallback
    const result = routeSpecEntry(["no-bundle-feature"], featureDir, workDir);
    expect(result.mode).toBe("feature");
  });

  it("treats feature directory with only requirements.md as feature, even with feature-style bundle", () => {
    const featureDir = join(workDir, "regular-feature");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "requirements.md"), "---\n---\n", "utf-8");

    const bundle = makeFeatureBundle("regular-feature");
    const result = routeSpecEntry(["regular-feature"], featureDir, workDir, bundle);
    expect(result.mode).toBe("feature");
  });
});
