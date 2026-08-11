---
topic: "archive-transcript-purge"
status: "approved"
date: "2026-05-12"
spec_ref: ".kiro/specs/archive-transcript-purge"
format: "lightweight"
---

## Objective

将 `claude project purge` 集成到 Forge 归档流程。创建归档脚本 `scripts/archive-spec.sh`，支持将已完成 spec 的文件移入 `.tinkerman/archive/` 并可选清理 CC transcripts。核心设计：两次独立确认 + 完整审计追踪 + 严格边界保护。

## Research Findings

1. **归档脚本不存在**：`scripts/archive-spec.sh` 和 `skills/forge-archive/SKILL.md` 均不存在。需从零创建。
2. **参考实现**：`scripts/prune-event-logs.sh` 提供了 Forge 脚本风格（`set -euo pipefail`、`--help`、info/success/warn/error helpers）。
3. **测试模式**：`test/persistent-loop.test.sh` 使用 `setup_fixtures` / `teardown_fixtures` / `assert_contains` 模式。
4. **无现有 CC purge 引用**：代码库中无任何 `claude project purge` 引用。
5. **安全知识**：instincts.md 记录外部命令用纯函数构建器 + `execFileSync`，shell 脚本需注意路径注入防护。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#architecture` | 五阶段流程：file-level archive → CC purge decision → safety checks → dry-run preview → real purge |
| `design.md#component-1-archive_driver` | Archive_Driver 脚本接口：参数解析、退出码、核心函数签名 |
| `design.md#component-2-purge_manifest` | Purge_Manifest JSON schema 和字段定义 |
| `design.md#component-4-test-coverage` | 测试覆盖策略：mock claude、六类测试 |
| `design.md#error-handling` | 错误分类表：git 失败、黑名单、CC 未安装、dry-run 失败等 |
| `design.md#testing-strategy` | shell 测试 + manifest schema 验证 + skill contract test |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `scripts/archive-spec.sh` | CREATE | 归档脚本主体：文件移动 + CC purge 集成 |
| `test/archive-purge.test.sh` | CREATE | bash 测试：mock claude 覆盖所有分支 |
| `.tinkerman/decisions/2026-05-12-cc-purge-integration.md` | CREATE | ADR：为什么集成 purge、设计权衡 |
| `README.md` | MODIFY | 新增"归档与 CC transcripts 清理"子节 |
| `CHANGELOG.md` | MODIFY | 新增 `[CHANGED]` 条目 |

## Task Breakdown

### Task 1: 创建归档脚本骨架 + 文件移动逻辑

- **Goal**: 创建 `scripts/archive-spec.sh`，实现 Phase 1 文件级归档（移动 spec/plan/progress 到 archive 目录）
- **File**: `scripts/archive-spec.sh`
- **Design Reference**: `design.md#component-1-archive_driver` — Archive_Driver 脚本接口
- **Depends On**: (none)
- **Verify**: `bash scripts/archive-spec.sh --help` 输出用法信息
- **Commit**: `feat(archive): add archive-spec.sh with file-level move logic`

### Task 2: 实现 CC purge 核心函数

- **Goal**: 在归档脚本中实现 `resolve_project_path()`、`check_blacklist()`、`cc_purge_preview()`、`cc_purge_execute()`、CC 版本检测
- **File**: `scripts/archive-spec.sh`
- **Design Reference**: `design.md#component-1-archive_driver` — 新增函数签名 + `design.md#architecture` Phase 3-5
- **Property**: R4 AC1-3（路径解析、黑名单、worktree 处理）
- **Depends On**: Task 1
- **Verify**: `shellcheck scripts/archive-spec.sh` 通过
- **Commit**: `feat(archive): add CC purge functions with safety checks`

### Task 3: 实现 --purge-cc 参数和交互流程

- **Goal**: 实现 `--purge-cc=ask|skip|auto` 参数解析、两次 prompt 流程、退出码分类（0/1/2/3）
- **File**: `scripts/archive-spec.sh`
- **Design Reference**: `design.md#component-1-archive_driver` — 参数解析 + `design.md#architecture` Phase 2 + Error Handling 表
- **Property**: R1 AC1-5, R3 AC1-4, R4 AC4
- **Depends On**: Task 2
- **Verify**: `bash scripts/archive-spec.sh --help` 显示 --purge-cc 选项
- **Commit**: `feat(archive): add --purge-cc flag with interactive flow`

### Task 4: 实现 Purge Manifest 写入

- **Goal**: 实现 `write_manifest()` 生成 `purge-manifest.json`，含 dry-run 先写 pending、执行后更新、stdout 截断、Ctrl+C trap
- **File**: `scripts/archive-spec.sh`
- **Design Reference**: `design.md#component-2-purge_manifest` — JSON schema 和字段定义
- **Property**: R2 AC1-4
- **Depends On**: Task 3
- **Verify**: 运行归档后检查 `purge-manifest.json` 结构
- **Commit**: `feat(archive): add purge-manifest.json generation`

### Task 5: 创建测试套件

- **Goal**: 创建 `test/archive-purge.test.sh`，使用 mock claude 覆盖 skip/auto/ask 三模式、黑名单、CC 版本过低、manifest schema、user_decision 所有路径
- **File**: `test/archive-purge.test.sh`
- **Design Reference**: `design.md#component-4-test-coverage` — 六类测试 + `design.md#testing-strategy`
- **Property**: 覆盖 R1-R4 所有 AC 的负面和正面路径
- **Depends On**: Task 4
- **Verify**: `bash test/archive-purge.test.sh` 全部通过
- **Commit**: `test(archive): add archive-purge.test.sh covering all branches`

### Task 6: ADR 和文档更新

- **Goal**: 创建 ADR、更新 README.md 和 CHANGELOG.md
- **File**: `.tinkerman/decisions/2026-05-12-cc-purge-integration.md`, `README.md`, `CHANGELOG.md`
- **Design Reference**: `design.md#component-3-skill-modification` — 文档要求
- **Property**: R5 AC1-4
- **Depends On**: Task 5
- **Verify**: `grep -c "CC transcripts" README.md` 非零
- **Commit**: `docs(archive): add ADR and README/CHANGELOG for CC purge integration`

### Task 7: npm run check 通过 + 端到端验证

- **Goal**: 确保 `npm run check` 通过，手动验证归档流程在 mock CC 下完整运行
- **File**: (no new files)
- **Design Reference**: `design.md#testing-strategy` — 手动 e2e
- **Depends On**: Task 6
- **Verify**: `npm run check` 通过
- **Commit**: `ci(archive): verify all checks pass`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1: 归档流程纳入 CC purge | Task 1, 2, 3 |
| R2: Purge_Manifest 记录 | Task 4 |
| R3: 非交互模式与 CI 场景 | Task 3 |
| R4: 安全边界与回滚 | Task 2, 3 |
| R5: 文档与 ADR | Task 6 |
