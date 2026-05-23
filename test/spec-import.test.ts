/**
 * T-14: External spec import tests.
 *
 * parseSpecArgs, parseExternalSpec, scoreImportedContent.
 *
 * Validates: Requirement 10
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseSpecArgs, parseExternalSpec, scoreImportedContent, runImportMode } from "../src/spec-import.js";

let testDir: string;

function createTestDir() {
  testDir = join(tmpdir(), `spec-import-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanup() {
  if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
}

describe("parseSpecArgs", () => {
  it('returns mode="feature" for non-path argument', () => {
    const result = parseSpecArgs(["my-feature"]);
    expect(result.mode).toBe("feature");
    expect(result.feature).toBe("my-feature");
  });

  it('returns mode="import" for existing file path', () => {
    const dir = createTestDir();
    try {
      const filePath = join(dir, "spec.md");
      writeFileSync(filePath, "# Spec");
      const result = parseSpecArgs([filePath]);
      expect(result.mode).toBe("import");
      expect(result.path).toBe(filePath);
    } finally {
      cleanup();
    }
  });

  it('returns mode="default" for empty args', () => {
    const result = parseSpecArgs([]);
    expect(result.mode).toBe("default");
  });
});

describe("parseExternalSpec", () => {
  it("extracts requirements and scenarios from PM-style markdown", () => {
    const text = `# Feature: User Login

## User Stories

As a user, I want to log in so I can access my account.

## Acceptance Criteria

- 当 用户输入正确密码 时 系统应当 返回登录成功
- 当 用户输入错误密码 时 系统应当 显示错误提示

## Non-functional

- 登录响应时间 < 500ms
`;

    const result = parseExternalSpec(text);
    expect(result.earsCriteria).toHaveLength(2);
    expect(result.earsCriteria[0].when).toBe("用户输入正确密码");
    expect(result.purpose).toContain("User Login");
  });

  it("returns empty criteria for unstructured text", () => {
    const text = "This is just a description with no structure.";
    const result = parseExternalSpec(text);
    expect(result.earsCriteria).toHaveLength(0);
  });
});

describe("scoreImportedContent", () => {
  it("returns RF when behavior-heavy", () => {
    const result = scoreImportedContent({
      earsCriteria: [{ line: 1, when: "用户操作", shall: "系统响应", raw: "..." }],
      hasArchitecture: false,
    });
    expect(result).toBe("requirements-first");
  });

  it("returns DF when architecture-heavy", () => {
    const result = scoreImportedContent({
      earsCriteria: [],
      hasArchitecture: true,
    });
    expect(result).toBe("design-first");
  });

  it("returns quick-plan when neither", () => {
    const result = scoreImportedContent({
      earsCriteria: [],
      hasArchitecture: false,
    });
    expect(result).toBe("quick-plan");
  });
});

describe("runImportMode", () => {
  it("returns error when input file not found", () => {
    const result = runImportMode("/nonexistent/path/spec.md", "/tmp/out");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("imports external spec and writes requirements.md", () => {
    const dir = createTestDir();
    try {
      const inputFile = join(dir, "user-auth.md");
      writeFileSync(inputFile, `# User Auth

- 当 用户登录 时 系统应当 返回 token
`);

      const outputDir = join(dir, "output");
      mkdirSync(join(outputDir, "user-auth"), { recursive: true });

      const result = runImportMode(inputFile, outputDir);
      expect(result.success).toBe(true);
      expect(result.feature).toBe("user-auth");
      expect(result.variant).toBe("requirements-first");
    } finally {
      cleanup();
    }
  });
});
