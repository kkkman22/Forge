---
title: "Worktree 构建中 .claude/ 文件跟踪与基线测试维护"
tags: ["worktree", "gitignore", "git-add-force", "property-testing", "byte-identity", "hooks"]
date: "2026-05-12"
confidence: 0.85
---

## Problem Pattern

Forge 的 `.claude/` 目录被 `.gitignore` 排除。在 worktree 中创建 agent/rule/dispatcher 文件后，`git status` 不显示它们，必须用 `git add -f` 强制跟踪。同时，属性测试（property test）中的 byte-identity 基线在 hooks.json schema 变更（如新增 `if:` 字段）时会全部失败。

**Trigger**: 在 worktree 中创建 `.claude/` 下的文件，或修改 hooks.json 结构后运行 byte-identity 测试。

**Impact**: 轻则测试套件红色阻断 ship，重则 agent/rule 文件遗漏在 merge 中（worktree 合并失败 / git add 遗漏）。

## Solution

1. `.claude/` 下文件一律 `git add -f <path>` 强制跟踪
2. 属性测试 byte-identity 基线使用结构化接口（含可选字段如 `if?: string`），schema 变更时同步更新 EXPECTED_* 常量
3. 契约测试使用 schema 级断言（字段存在性 + 类型检查），不依赖 byte-identity

## Pitfall Record

- **P1**: 合并后发现 agent 文件未包含在 commit 中 → `git add -f` 解决
- **P2**: hooks.json 新增 `if:` 字段后，4 个 byte-identity 测试失败 → 更新 HookMatcher 接口添加 `if?: string` + 更新所有 EXPECTED_* 基线
- **P3**: plan context hook matcher 从 "Write|Edit|Bash" 变为 "Write|Edit" → 基线不匹配

## Decision Rationale

- Byte-identity 测试 vs schema 测试：byte-identity 捕获意外变更（如排字错误、字段顺序），schema 测试验证结构正确性。两者互补，不替代
- `git add -f` vs 修改 .gitignore：Forge 的 `.claude/` 整体 gitignore 是合理的（用户配置），`-f` 是白名单例外机制

## Reusable Pattern

**Pattern: 双层测试策略 for config 文件**
- Layer 1: Byte-identity 测试保护关键配置不被意外修改（snapshot-style）
- Layer 2: Contract 测试验证 schema 合规（structural assertions）
- 变更 config 时：先更新 EXPECTED 基线 → 运行测试 → 提交

**Pattern: git add -f 白名单**
- `.gitignore` 排除整个目录
- 需要跟踪的文件用 `git add -f`
- 适用于"目录大部分不跟踪，但特定文件需要版本控制"的场景
