---
topic: "documentation-onboarding"
status: approved
date: "2026-05-12"
spec_ref: ".tinkerman/specs/documentation-onboarding/spec.md"
format: lightweight
monolith_acknowledged: true
---

# Plan: 新用户引导文档与 README 优化

> 来源：`.kiro/specs/documentation-onboarding/`
> 设计文档已存在 → 使用 Lightweight Task 格式

## Overview

将 Forge 项目文档体系从 782 行密集 README 重构为分层文档结构。新建 20+ 文档文件，重组 README，添加验证脚本并集成到 CI。

## File Mapping

### CREATE（新建）

| 文件路径 | 说明 |
|---------|------|
| `docs/INDEX.md` | 文档导航索引（中文） |
| `docs/INDEX.en.md` | 文档导航索引（英文） |
| `docs/quick-start.md` | 快速入门指南（中文） |
| `docs/quick-start.en.md` | 快速入门指南（英文） |
| `docs/onboarding-beginner.md` | 初次接触者引导（中文） |
| `docs/onboarding-beginner.en.md` | 初次接触者引导（英文） |
| `docs/onboarding-daily.md` | 日常开发者引导（中文） |
| `docs/onboarding-daily.en.md` | 日常开发者引导（英文） |
| `docs/onboarding-advanced.md` | 高级用户引导（中文） |
| `docs/onboarding-advanced.en.md` | 高级用户引导（英文） |
| `docs/workflow-bugfix.md` | Bug 修复工作流示例 |
| `docs/workflow-feature.md` | 新功能开发工作流示例 |
| `docs/workflow-complex.md` | 复杂需求工作流示例 |
| `docs/workflow-resume.md` | 会话恢复工作流示例 |
| `docs/reference-security.md` | 安全与信任参考文档 |
| `docs/reference-architecture.md` | 架构与状态保护参考文档 |
| `docs/reference-advanced.md` | 高级功能参考文档 |
| `docs/reference-commands.md` | 命令速查参考文档 |
| `scripts/check-doc-links.sh` | 链接有效性检查脚本 |
| `scripts/check-doc-structure.sh` | 文档结构验证脚本 |

### MODIFY（修改）

| 文件路径 | 说明 |
|---------|------|
| `README.md` | 从 782 行重组为 ~150 行，添加导航索引表 |
| `package.json` | scripts.check 追加文档验证脚本 |

## Tasks

### Wave 0: 基础设施

**Task 1** — 创建 docs/INDEX.md 文档导航索引
- Target: `docs/INDEX.md`
- Design: `design.md#信息架构层次`
- Verify: `bash scripts/check-doc-structure.sh` 通过
- Commit: `docs(docs): add navigation index`

**Task 2** — 创建链接检查脚本
- Target: `scripts/check-doc-links.sh`
- Design: `design.md#链接检查机制`
- Verify: `bash scripts/check-doc-links.sh` 返回 0（无失效链接）
- Commit: `docs(scripts): add doc link checker`

**Task 3** — 创建文档结构验证脚本
- Target: `scripts/check-doc-structure.sh`
- Design: `design.md#文档结构验证`
- Verify: `bash scripts/check-doc-structure.sh` 返回 0
- Commit: `docs(scripts): add doc structure validator`

**Task 4** — 集成验证脚本到 CI
- Target: `package.json`
- Design: `design.md#CI 集成`
- Verify: `npm run check` 包含文档验证且通过
- Commit: `build(package): integrate doc checks into CI`
- Dependencies: Task 2, Task 3

### Wave 1: 参考文档（从 README 拆分）

**Task 5** — 创建 reference-security.md
- Target: `docs/reference-security.md`
- Design: `design.md#参考文档`
- Verify: 文件存在，第一行含返回索引链接
- Commit: `docs(reference): add security reference doc`

**Task 6** — 创建 reference-architecture.md
- Target: `docs/reference-architecture.md`
- Design: `design.md#参考文档`
- Verify: 文件存在，第一行含返回索引链接
- Commit: `docs(reference): add architecture reference doc`

**Task 7** — 创建 reference-advanced.md
- Target: `docs/reference-advanced.md`
- Design: `design.md#参考文档`
- Verify: 文件存在，第一行含返回索引链接
- Commit: `docs(reference): add advanced features reference doc`

**Task 8** — 创建 reference-commands.md
- Target: `docs/reference-commands.md`
- Design: `design.md#参考文档`
- Verify: 文件存在，第一行含返回索引链接
- Commit: `docs(reference): add commands reference doc`

### Wave 2: 快速入门与引导路径

**Task 9** — 创建 quick-start.md
- Target: `docs/quick-start.md`
- Design: `design.md#文件清单与职责` + `requirements.md#需求1`
- Verify: 含 5 步流程、3 种安装方式、3+ 故障排除、2 个示例
- Commit: `docs(guide): add quick start guide`

**Task 10** — 创建 onboarding-beginner.md
- Target: `docs/onboarding-beginner.md`
- Design: `requirements.md#需求2`
- Verify: 含学习时间、前置知识、基础概念、3 个命令详解、实操练习
- Commit: `docs(guide): add beginner onboarding path`

**Task 11** — 创建 onboarding-daily.md
- Target: `docs/onboarding-daily.md`
- Design: `requirements.md#需求2`
- Verify: 含标准路径各阶段说明、实操练习
- Commit: `docs(guide): add daily developer onboarding path`

**Task 12** — 创建 onboarding-advanced.md
- Target: `docs/onboarding-advanced.md`
- Design: `requirements.md#需求2`
- Verify: 含全量路径、知识系统、Forge Loop、Domain Pack、贡献指南
- Commit: `docs(guide): add advanced user onboarding path`

### Wave 3: 工作流示例

**Task 13** — 创建 workflow-bugfix.md
- Target: `docs/workflow-bugfix.md`
- Design: `requirements.md#需求4`
- Verify: 含 build→review 流程、失败恢复、自动推进标注
- Commit: `docs(workflow): add bugfix workflow example`

**Task 14** — 创建 workflow-feature.md
- Target: `docs/workflow-feature.md`
- Design: `requirements.md#需求4`
- Verify: 含 plan→build→review→test→ship 流程、失败恢复
- Commit: `docs(workflow): add feature development workflow example`

**Task 15** — 创建 workflow-complex.md
- Target: `docs/workflow-complex.md`
- Design: `requirements.md#需求4`
- Verify: 含全量路径完整流程
- Commit: `docs(workflow): add complex requirement workflow example`

**Task 16** — 创建 workflow-resume.md
- Target: `docs/workflow-resume.md`
- Design: `requirements.md#需求4`
- Verify: 含 forge resume 和 --from-pr 场景
- Commit: `docs(workflow): add session resume workflow example`

### Wave 4: README 重组

**Task 17** — 重组 README.md
- Target: `README.md`
- Design: `design.md#README 结构模型`
- Verify: 行数 ≤200，前 20 行含描述+卖点，含导航索引表，所有链接有效
- Commit: `docs(readme): restructure for clarity`
- Dependencies: Wave 1（参考文档必须先存在）

### Wave 5: 国际化

**Task 18** — 创建英文版文档
- Target: `docs/*.en.md` (5 files: INDEX.en.md, quick-start.en.md, onboarding-*.en.md)
- Design: `requirements.md#需求6` + `design.md#国际化文件命名规范`
- Verify: 每个英文版含翻译状态标记、中文版链接
- Commit: `docs(i18n): add English translations`
- Dependencies: Wave 2, Task 1

**Task 19** — 更新中文文档添加英文版链接
- Target: `docs/quick-start.md`, `docs/onboarding-*.md`, `docs/INDEX.md`
- Design: `requirements.md#需求6`
- Verify: 每个有英文版的中文文档头部含英文版链接
- Commit: `docs(i18n): add English version links`
- Dependencies: Task 18

### Wave 6: 最终验证

**Task 20** — 更新索引并运行完整验证
- Target: `docs/INDEX.md`
- Design: `design.md#文档索引条目模型`
- Verify: `npm run check` 通过，`bash scripts/check-doc-links.sh` 无错误
- Commit: `docs(index): finalize navigation index`
- Dependencies: All previous tasks

## Spec Coverage Matrix

| 需求 | 覆盖任务 | 状态 |
|------|---------|------|
| R1 快速入门 | Task 9 | ✅ |
| R2 分层引导 | Task 10, 11, 12 | ✅ |
| R3 README 优化 | Task 17 | ✅ |
| R4 工作流示例 | Task 13, 14, 15, 16 | ✅ |
| R5 文档导航 | Task 1, 2, 3, 4, 20 | ✅ |
| R6 国际化 | Task 18, 19 | ✅ |

## Self-Check

- [x] Spec Coverage: 6/6 需求被覆盖
- [x] Placeholder Scan: 无占位符
- [x] Dependencies: 拓扑排序正确（参考文档 → 内容 → README → 国际化）
- [x] Plan Structure: 已标记 `monolith_acknowledged: true`（文档项目，任务间高度依赖，适合单 plan）

## Dependency Graph

```
Wave 0:  1, 2, 3
         ↓
Wave 1:  4 → 5, 6, 7, 8
                  ↓
Wave 2:           9, 10, 11, 12
                       ↓
Wave 3:                13, 14, 15, 16
                            ↓
Wave 4:                     17
                            ↓
Wave 5:                     18 → 19
                                  ↓
Wave 6:                           20
```
