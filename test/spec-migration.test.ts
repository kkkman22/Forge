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

  // P2-B: rollback when frontmatter feature differs from directory name.
  // Reproduces the audit-flagged corner case where the directory was named
  // (say) "auth" but the spec.md frontmatter says feature: "authentication".
  // The plans file lives under plans/<feature>.md, so rollback must use the
  // captured rename path — not a path reconstructed from the directory.
  it("rolls back plans .legacy correctly when feature name differs from directory name", () => {
    const root = createTestDir();
    try {
      const featureDir = join(root, "auth"); // directory name
      mkdirSync(featureDir, { recursive: true });
      // spec.md uses a DIFFERENT name in frontmatter
      const spec = `---
feature: authentication
status: locked
date: 2026-05-20
---

# 目的

Test rollback path for feature/dirname mismatch.

## 需求

### 需求 1: Trigger Analyze P0

- 当 用户输入相同条件 则 系统应当 返回 A
- 当 用户输入相同条件 则 系统应当 返回 B
`;
      writeFileSync(join(featureDir, "spec.md"), spec);

      // plans file lives under <feature> name from frontmatter, not dir name
      const plansDir = join(root, "plans");
      mkdirSync(plansDir, { recursive: true });
      const plansPath = join(plansDir, "authentication.md");
      writeFileSync(
        plansPath,
        "---\n---\n\n## Tasks\n\n### T-99 Some task\n\nlegacy plan task content\n",
      );

      // Migration should fail at the P0 Analyze gate (ANL-04 conflict —
      // same `当 X 时` with two different shall) and fully roll back.
      const result = migrateLegacySpec(featureDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain("rolling back");

      // Three files were rolled back
      expect(existsSync(join(featureDir, "requirements.md"))).toBe(false);
      expect(existsSync(join(featureDir, "design.md"))).toBe(false);
      expect(existsSync(join(featureDir, "tasks.md"))).toBe(false);

      // spec.md restored
      expect(existsSync(join(featureDir, "spec.md"))).toBe(true);

      // plans/authentication.md restored (NOT left as .legacy)
      expect(existsSync(plansPath)).toBe(true);
      expect(existsSync(`${plansPath}.legacy`)).toBe(false);
    } finally {
      cleanup();
    }
  });

  // REQ-03 (audit-remediate-0619): the failure branch must emit a
  // spec_migration_failed event via event-writer. Before the fix it used
  // `require("./event-writer.js")`, which throws ReferenceError at runtime in
  // native ESM — so the event was never written (and the error was swallowed
  // by the surrounding best-effort catch). This test pins the corrected
  // behavior: when migration fails AND eventsPath is provided, the failure
  // event is recorded to disk.
  it("writes spec_migration_failed event on rollback when eventsPath is provided", () => {
    const root = createTestDir();
    try {
      const featureDir = join(root, "auth");
      mkdirSync(featureDir, { recursive: true });
      // ANL-04 conflict: same `当 X 时` with two different shall → P0 finding → rollback
      const spec = `---
feature: authentication
status: locked
date: 2026-05-20
---

# 目的

Trigger rollback with event.

## 需求

### 需求 1: Conflict

- 当 用户输入相同条件 则 系统应当 返回 A
- 当 用户输入相同条件 则 系统应当 返回 B
`;
      writeFileSync(join(featureDir, "spec.md"), spec);

      const eventsPath = join(root, "events.jsonl");
      const result = migrateLegacySpec(featureDir, eventsPath);
      expect(result.success).toBe(false);

      // The failure event must have been written (not swallowed by a require
      // ReferenceError). This is the core assertion of REQ-03.
      expect(existsSync(eventsPath)).toBe(true);
      const events = readFileSync(eventsPath, "utf-8");
      expect(events).toContain("spec_migration_failed");
    } finally {
      cleanup();
    }
  });
});
