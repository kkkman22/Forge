---
feature: misc-forge-optimization
layout: tasks
created: 2026-05-30
spec_ref: ".forge/specs/misc-forge-optimization/requirements.md"
---

# Tasks

## Task 1: Agent 自包含评估（§22）

- [ ] 1.1 调研 Claude Code agent frontmatter 的 `mcpServers` 和 `hooks` 支持
- [ ] 1.2 评估哪些 Forge agent 需要自包含（如 forge-build 需要特定 MCP？）
- [ ] 1.3 产出 ADR：`.forge/decisions/2026-05-30-agent-self-contained-eval.md`

**Verify-By**: bash — 检查 ADR 文件存在
**关联需求**: R1

## Task 2: CI 脚本评估（§52, §53）

- [ ] 2.1 评估 `--bare` 对 ultrareview 的影响
- [ ] 2.2 评估 `--exclude-dynamic-system-prompt-sections` 对分析质量的影响
- [ ] 2.3 在 `scripts/run-ci-ultrareview.sh` 中记录决策（注释）

**Verify-By**: bash — `grep -E '(bare|exclude-dynamic)' scripts/run-ci-ultrareview.sh`
**关联需求**: R4, R5

## Task 3: worktree 配置文档化（§24, §56, §59）

- [ ] 3.1 在 `forge init` 模板中注释 `worktree.bgIsolation` 适用场景
- [ ] 3.2 在 build SKILL instructions 中添加 mid-session worktree 切换指导
- [ ] 3.3 在 `forge init` 模板中注释 `worktree.sparsePaths` 配置

**Verify-By**: manual — 文档审阅
**关联需求**: R2, R6, R7

## Task 4: Plugin Monitors 评估（§39）

- [ ] 4.1 调研 Claude Code plugin `monitors` 功能的 API
- [ ] 4.2 评估 Forge 的哪些 Stop hook 轮询可被 monitors 替代
- [ ] 4.3 产出 ADR

**Verify-By**: bash — 检查 ADR 文件存在
**关联需求**: R3

## Task 5: 文档与配置补充（§83, §90）

- [ ] 5.1 README 添加 `! <command>` 使用说明
- [ ] 5.2 `forge init` 模板注释 `CLAUDE_CODE_SIMPLE` 用途和限制

**Verify-By**: bash — `grep '! <command>' README.md`
**关联需求**: R8, R9

## Task 6: 回归验证

- [ ] 6.1 `npm run check` 通过
- [ ] 6.2 新增配置不影响现有行为

**Verify-By**: bash
**关联需求**: 全部
