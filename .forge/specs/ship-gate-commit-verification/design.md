---
feature: ship-gate-commit-verification
layout: design
created: 2026-05-01
---

# Design Document: Ship Gate Commit Verification

## Overview

在 review 报告中记录评审时的 commit hash（`reviewed_at_commit`），在 ship 门禁中增加 commit 比对步骤。轻量改动：2 个 SKILL.md + 2 个 TypeScript 模块。

## Architecture

```
forge-review 完成时
  → 读取 git rev-parse HEAD
  → 写入 .forge/reviews/<topic>.md frontmatter: reviewed_at_commit

forge-ship 门禁检查时
  → 读取 reviewed_at_commit
  → 读取当前 HEAD
  → 比较：相同 → pass；不同 → 检查 diff
  → diff 仅 .forge/ → pass；涉及项目代码 → ⚠️ 警告
```

## Components and Interfaces

### 1. Review 报告 Frontmatter 更新

```yaml
---
topic: "<主题>"
date: "YYYY-MM-DD"
result: "pass" | "fail" | "incomplete"
reviewed_at_commit: "a1b2c3d4e5f6"  # 新增
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
layers:
  spec_check: "pass"
  quality_check: "pass"
  security_check: "pass"
---
```

### 2. review.ts 类型更新

```typescript
// ReviewReportFrontmatter 增加字段
export interface ReviewReportFrontmatter {
  topic: string;
  date: string;
  result: "pass" | "fail" | "incomplete";
  reviewed_at_commit?: string;  // 新增，optional for backward compat
  p0_count: number;
  p1_count: number;
  p2_count: number;
  p3_count: number;
}
```

### 3. ship.ts 纯函数

```typescript
export interface ReviewFreshnessResult {
  fresh: boolean;
  reason: string;
  changedFiles?: string[];  // 仅当 fresh=false 时填充
}

export function checkReviewFreshness(
  reviewedCommit: string | undefined,
  currentHead: string,
  changedFiles: string[],
): ReviewFreshnessResult {
  // Case 1: 无 reviewed_at_commit（向后兼容）
  if (reviewedCommit === undefined) {
    return { fresh: true, reason: "no reviewed_at_commit field (backward compatible)" };
  }

  // Case 2: commit 相同
  if (reviewedCommit === currentHead) {
    return { fresh: true, reason: "review matches current HEAD" };
  }

  // Case 3: commit 不同，检查 diff 范围
  const nonForgeFiles = changedFiles.filter(f => !f.startsWith(".forge/"));

  if (nonForgeFiles.length === 0) {
    return { fresh: true, reason: "changes only in .forge/ state files" };
  }

  // Case 4: 项目代码有变更
  return {
    fresh: false,
    reason: "project code changed since review",
    changedFiles: nonForgeFiles,
  };
}
```

### 4. forge-ship SKILL.md 门禁更新

在 §2 Gate Checks 的 Review Gate 后增加 Review Freshness 检查：

```markdown
**Review Freshness Check**（Review Gate 通过后执行）：

1. 读取 `.forge/reviews/<topic>.md` 的 `reviewed_at_commit` 字段
2. 获取当前 HEAD：`git rev-parse HEAD`
3. 比较：
   - 相同 → ✅ 通过
   - `reviewed_at_commit` 缺失 → ✅ 通过（向后兼容）
   - 不同 → 获取 diff 文件列表：`git diff --name-only <reviewed_at_commit> HEAD`
     - 仅 `.forge/` 文件 → ✅ 通过
     - 涉及项目代码 → ⚠️ 警告（不阻断）

**警告输出格式**：
⚠️ Review 时效性警告
  评审时 commit：<reviewed_at_commit>
  当前 commit：<current HEAD>
  评审后变更的项目文件：
    - <file1>
    - <file2>
  建议：运行 /forge review 重新评审，或确认继续交付
```

## Correctness Properties

### Property 1: 向后兼容

*For any* review report without `reviewed_at_commit` field, `checkReviewFreshness(undefined, anyHead, anyFiles)` SHALL return `{ fresh: true }`.

### Property 2: 相同 commit 始终通过

*For any* commit hash `h`, `checkReviewFreshness(h, h, anyFiles)` SHALL return `{ fresh: true }`.

### Property 3: 仅 .forge/ 变更通过

*For any* different commits and file list where ALL files start with `.forge/`, `checkReviewFreshness(a, b, files)` SHALL return `{ fresh: true }`.

### Property 4: 项目代码变更触发警告

*For any* different commits and file list where ANY file does NOT start with `.forge/`, `checkReviewFreshness(a, b, files)` SHALL return `{ fresh: false }`.

## Testing Strategy

### 属性测试

`test/ship-freshness.property.test.ts`：
- Property 1-4 的 fast-check 属性测试
- 生成器：随机 commit hash（hex string）、随机文件路径列表（含/不含 `.forge/` 前缀）

### 单元测试

`test/ship.test.ts`（扩展现有）：
- `checkReviewFreshness` 的 4 个 case 的具体输入输出验证
- 边界情况：空文件列表、空 commit hash

### 合约测试

- contract.test.ts：验证 forge-review 和 forge-ship SKILL.md frontmatter 格式
