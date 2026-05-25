---
current_task: "workflows-integration"
tier: "standard"
task_type: "feature"
project_phase: "implementation"
phase: "completed"
work_nature: "feature"
updated: "2026-05-25"
branch: "worktree-workflows-integration"
spec_path: ".kiro/specs/workflows-integration/"
plan_path: ".kiro/specs/workflows-integration/tasks.md"
hints: "workflows,cli-subprocess,stream-json,fallback-ladder,dispatch,audit,ipc,tdd"
assumptions:
  - "spec 目录含 requirements+design+tasks = decide+spec+plan 完成"
  - "14 tasks / 4 phases / 2 工作包（分发层 + 换芯）"
  - "遵循 TDD RED→GREEN→REFACTOR 铁律"
---

# 项目状态

## 当前任务：workflows-integration — ✅ 完成

Standard-tier 全流程完成（build → review → test）。保留分支待合并。

**17 commits / 14 tasks / 118 new tests / TypeScript clean / 0 P0-P2 issues**

交付物清单：
- **6 新模块**：workflow-dispatcher, stream-json-adapter, cli-subprocess-driver, ipc-emitter, workflow-audit-writer, error-handler
- **4 改造文件**：plugin.json (workflows字段), forge-loop-cli.ts (换芯), sdk-agent-adapter.ts (deprecated), sdk-driver-types.ts (warmQuery optional)
- **3 工具/规则**：validate-plugin-manifest.mjs, diff-ipc-schema.mjs, workflow-fallback-ladder.md
- **2 workflow 文件**：multi-agent-review.js, lib/concurrency.js
- **14 测试文件**：覆盖全部 AC

## 已完成

workflows-integration: 17 commits on worktree-workflows-integration (保留).
docs-governance-system core library: 23 commits merged to main (76581bc1).
forge-single-entry-skills-collapse: 47 commits merged to main (6127feb).
cmux-skills-collapse: merged to main.
