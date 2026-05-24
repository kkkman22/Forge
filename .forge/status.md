---
current_task: "docs-governance-system"
tier: "standard"
task_type: "feature"
project_phase: "implementation"
phase: "build"
work_nature: "feature"
updated: "2026-05-24"
branch: "worktree-docs-governance-system"
spec_path: ".kiro/specs/docs-governance-system/"
plan_path: ".kiro/specs/docs-governance-system/tasks.md"
hints: "docs-governance,frontmatter,index-generator,ssot,embeds,pre-commit,tdd"
assumptions:
  - "spec 目录含 requirements+design+tasks = decide+spec+plan 完成"
  - "7 parent tasks / 56 subtasks / 7 waves / 5 migration phases"
  - "src/docs-governance/ 新模块：types, config, domains, frontmatter, index-generator, staleness, updated-auditor, link-checker, quota, root-whitelist, bilingual, ssot, reporter, cli"
  - "13 CLI scripts + pre-commit hook + CI workflow"
  - "5 层治理：分类隔离、总目录自动生成、失修检测、数量纪律、SSOT 嵌入"
---

# 项目状态

## 当前任务：docs-governance-system

Standard-tier build。文档治理体系：五层机制（分类隔离、总目录自动生成、失修检测、数量纪律、SSOT 段落级嵌入），7 个父任务 / 56 个子任务 / 7 个 wave / 5 个迁移阶段。

**Spec**：`.kiro/specs/docs-governance-system/`
**Plan**：`.kiro/specs/docs-governance-system/tasks.md`（7 tasks，7 waves）

## 已完成

forge-single-entry-skills-collapse: 47 commits merged to main (6127feb).
cmux-skills-collapse: merged to main.
