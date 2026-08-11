---
date: "2026-05-10"
type: "remediation-decisions"
source: "三 Sprint 竞技审计"
spec_ref: ".kiro/specs/sprint-3-gap-remediation/"
---

# Sprint 审计修复决策

## 决策 1: 补缺口而非重做 Sprint

**背景**: 三 Sprint 整体完成度约 90%，存在 6 处局部缺口。

**选择**: 逐项修复缺口

**理由**: 核心机制已到位，缺口是局部补丁性质。重做 Sprint 成本高且风险大——已有测试和依赖链需要全部重建。

**权衡**: 补丁修复可能留下不一致的代码风格，但实际缺口都在独立模块中（glossary parser、context-boundary、agent 文件），不存在跨切面影响。

## 决策 2: Lint Rule 形态用 Amendment 而非重写

**背景**: Sprint 3 R7/R8 requirements 写"Biome plugin"，实际交付 YAML 声明式规则。

**选择**: 修正 Requirement 措辞（amendment），不重写代码

**理由**: YAML 声明式是**有意识的工程取舍**——零新依赖、Pack 代码纯数据、Zero-Pack 友好。重写 Biome plugin 引入新依赖且违反 Pack 零代码执行安全原则。

**权衡**: 开发者无法在 IDE 实时看到 lint 警告，需手动跑脚本。后续可单独立 spec 包装 Biome plugin。

## 决策 3: 提炼 R6/R7/R8 Evolved Rules

**背景**: 审计暴露三种 review 盲区（漏合并、格式断层、stub-as-降级）。

**选择**: 固化为 evolved rules 长期护栏

**理由**: 三种盲区有共同特征——review 阶段登记为 pass 但运行时行为与 spec 存在落差。纯靠 review checklist 无法覆盖，需要项目特定规则。

**实现**: R6（主分支存在性验证）、R7（Pack/Loader 运行时验证）、R8（stub 不是降级）。Confidence 0.85-0.9。
