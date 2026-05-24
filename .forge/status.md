---
current_task: "docs-governance-system"
tier: "standard"
task_type: "feature"
project_phase: "implementation"
phase: "ship"
work_nature: "feature"
updated: "2026-05-24"
branch: ""
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

Standard-tier ship 完成（核心 library 层）。23 commits merged to main (76581bc1)。

**已交付**：20 modules, 256 tests, 18 correctness properties (P1-P18)。
**待后续 PR**：CLI script entries, pre-commit hook, CI workflow, frontmatter migration, SSOT embed-sync, documentation (wave 7)。

## 已完成

docs-governance-system core library: 23 commits merged to main (76581bc1).
forge-single-entry-skills-collapse: 47 commits merged to main (6127feb).
cmux-skills-collapse: merged to main.
