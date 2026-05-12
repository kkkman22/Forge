---
current_task: "documentation-onboarding"
tier: "standard"
task_type: "documentation"
project_phase: "in_progress"
phase: "test"
updated: "2026-05-12"
---

# 项目状态

## 当前任务

**documentation-onboarding** — 新用户引导文档与 README 优化
- Spec: `.forge/specs/documentation-onboarding/spec.md` (locked)
- Plan: `.forge/plans/documentation-onboarding.md` (approved)
- 分支: `feature/documentation-onboarding`
- 6 需求，20 任务，24 个新/修改文件
- build 完成，进入 review

## Build 完成摘要

### 新建文件（24 个）

| 类别 | 文件 |
|------|------|
| 基础设施 | `docs/INDEX.md`, `docs/INDEX.en.md`, `scripts/check-doc-links.sh`, `scripts/check-doc-structure.sh` |
| 参考文档 | `docs/reference-security.md`, `docs/reference-architecture.md`, `docs/reference-advanced.md`, `docs/reference-commands.md` |
| 快速入门 | `docs/quick-start.md`, `docs/quick-start.en.md` |
| 引导路径 | `docs/onboarding-beginner.md`, `docs/onboarding-beginner.en.md`, `docs/onboarding-daily.md`, `docs/onboarding-daily.en.md`, `docs/onboarding-advanced.md`, `docs/onboarding-advanced.en.md` |
| 工作流示例 | `docs/workflow-bugfix.md`, `docs/workflow-feature.md`, `docs/workflow-complex.md`, `docs/workflow-resume.md` |

### 修改文件（3 个）

| 文件 | 说明 |
|------|------|
| `README.md` | 从 782 行重组为 148 行，添加导航索引和路由表 |
| `package.json` | `check` 脚本追加文档验证 |
| `CONTRIBUTING.md` | 修复失效链接 |

### 验证结果

- `bash scripts/check-doc-links.sh` — ✅ 全部链接有效
- `bash scripts/check-doc-structure.sh` — ✅ 结构合规
- 合约测试 — ✅ 433/433 通过
- `npm run check` — 1 个前置 flaky 属性测试（与文档无关），其余全部通过

## 已完成任务

- frozen-zone-structured-feedback: 结构化 JSON frozen-zone 保护（ADR-0001，127 新测试）
- ccbp-hardening-phase2: CCBP Phase 2 hooks if: + compaction + agent frontmatter + dispatcher + rules + version gate
- plugin-distribution: Forge Plugin 化分发
- ccbp-inspired-hardening: Claude Code Best Practice 借鉴的工程加固
- archive-transcript-purge: CC project purge 集成到 Forge 归档流程
- cmux-integration: Sprint 1-6 全部完成（33 tasks，25 test files，158 tests）
- resume-phase-coverage: compaction 恢复后 SKILL.md 步骤遗漏修复
- phase-advance-hardening: SKILL 驱动模式阶段推进断点修复
- oz-skills-inspiration
- v2.4-review-followups（暂停）
- build-discipline-enhancement: SKILL 工程纪律规则
- token-language-optimization P2+P3: 全部 tasks 1-12 完成
- state-resilience: 状态系统三层防御
- ship-gate-commit-verification: ship 门禁 commit 验证
- routing-assumptions: 路由器输出增加假设段落
- skill-behavioral-guardrails: SKILL 行为护栏
- Group C/D/E: 社区基础设施
- feature-dossier-index: Feature Dossier Index 系统（R1-R8，49 topics）
