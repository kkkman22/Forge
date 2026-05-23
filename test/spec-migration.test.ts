/**
 * T-08: Auto migration logic tests.
 *
 * migrateLegacySpec: splits spec.md → three files, plans → tasks.md.
 *
 * Validates: Requirements 7, 8, 9
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateLegacySpec } from "../src/spec-migration.js";

let testDir: string;

function createTestDir(): string {
  testDir = join(tmpdir(), `spec-migration-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanup() {
  if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
}

const VALID_SPEC_MD = `---
feature: legacy-feature
status: locked
date: 2026-05-20
---

# 目的

Test purpose for legacy spec.

## 需求

### 需求 1: 用户登录

- 当 用户输入正确密码 则 系统返回登录成功
- 当 用户输入错误密码 则 系统返回错误提示

### 需求 2: 用户登出

- 当 用户点击登出 则 系统清除会话

## 不做什么

- 不做社交登录

## Delta

### 新增

- auth/login.ts

### 修改

- routes/index.ts

### 不变

- utils/helper.ts
`;

// ---------------------------------------------------------------------------
// migrateLegacySpec
// ---------------------------------------------------------------------------

describe("migrateLegacySpec", () => {
  it("splits spec.md into three files with migrated_from", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "spec.md"), VALID_SPEC_MD);

      const result = migrateLegacySpec(dir);
      expect(result.success).toBe(true);

      // Three files created
      expect(existsSync(join(dir, "requirements.md"))).toBe(true);
      expect(existsSync(join(dir, "design.md"))).toBe(true);
      expect(existsSync(join(dir, "tasks.md"))).toBe(true);

      // Original renamed to spec.legacy.md
      expect(existsSync(join(dir, "spec.legacy.md"))).toBe(true);
      expect(existsSync(join(dir, "spec.md"))).toBe(false);

      // migrated_from in frontmatter
      const reqContent = readFileSync(join(dir, "requirements.md"), "utf-8");
      expect(reqContent).toContain("migrated_from: spec.md");
    } finally {
      cleanup();
    }
  });

  it("preserves EARS clauses from legacy scenarios", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "spec.md"), VALID_SPEC_MD);

      migrateLegacySpec(dir);

      const reqContent = readFileSync(join(dir, "requirements.md"), "utf-8");
      expect(reqContent).toContain("当");
    } finally {
      cleanup();
    }
  });

  it("migrates brownfield Delta to requirements.md", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "spec.md"), VALID_SPEC_MD);

      migrateLegacySpec(dir);

      const reqContent = readFileSync(join(dir, "requirements.md"), "utf-8");
      expect(reqContent).toContain("## Delta");
      expect(reqContent).toContain("### 新增");
      expect(reqContent).toContain("auth/login.ts");
      expect(reqContent).toContain("### 修改");
      expect(reqContent).toContain("routes/index.ts");
      expect(reqContent).toContain("### 不变");
      expect(reqContent).toContain("utils/helper.ts");
    } finally {
      cleanup();
    }
  });

  it("does not write new files when parsing fails", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "spec.md"), "Not valid YAML frontmatter at all");

      const result = migrateLegacySpec(dir);
      expect(result.success).toBe(false);

      // Original file preserved
      expect(existsSync(join(dir, "spec.md"))).toBe(true);
      expect(existsSync(join(dir, "requirements.md"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("skips migration when three files already exist", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "spec.md"), VALID_SPEC_MD);
      writeFileSync(join(dir, "requirements.md"), "---\nfeature: x\n---\n");

      const result = migrateLegacySpec(dir);
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("skips migration when no spec.md exists", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });

      const result = migrateLegacySpec(dir);
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    } finally {
      cleanup();
    }
  });
});
