---
feature: context-aware-domain-knowledge
layout: design
created: 2026-06-03
---

# Design Document: 领域知识增强 — Glossary 升级 + Grill 实时维护

## Overview

本功能增强 Forge 的领域知识管理能力，将 `.tinkerman/glossary.md` 从扁平术语表升级为结构化的领域建模工具（新增 Avoid 列表、术语关系、歧义记录），并在 `/forge grill` 过程中实现实时 glossary 维护。同时增强 glossary conflict detection 的检测能力。

**灵感来源**：Matt Pocock `skills` 仓库的 `/grill-with-docs` skill + `CONTEXT-FORMAT.md` + `ADR-FORMAT.md`。

**关键设计决策**：**不引入新的 `CONTEXT.md` 文件**。Forge 已有 `glossary.md` 作为术语 single source of truth，且被 grill/decide/plan/build 多个阶段引用。引入新文件会造成双源问题和同步负担。增强现有 glossary 格式来承载 Matt 的 CONTEXT.md 能力。

**修改范围**：
1. `.tinkerman/glossary.md` — 格式升级（追加可选字段）
2. `skills/forge/lib/grill/instructions.md` — 新增 §4a 实时 glossary 维护
3. `src/grill.ts` — 增强 `checkGrillGlossaryConflicts` 函数
4. `skills/forge/lib/decide/instructions.md` — §3.0 引用更新

**设计原则**：
- 向后兼容：旧格式条目（只有 定义+别名）仍然有效
- 新增字段全部可选，渐进增强
- 不改变 glossary.md 的文件位置（保持 `.tinkerman/glossary.md`）
- 不改变 `runGlossaryCheck` 的调用点

## Architecture

### 现有实现分析

**`.tinkerman/glossary.md`** 当前格式：

```markdown
## Tier
**定义**: Forge 三维路由中的复杂度维度，决定运行哪些命令。取值 light / standard / full。
**别名**: 档位, 复杂度档位
**更新**: 2026-05-06
**来源**: 初始预置
```

只有：定义 + 别名 + 更新日期 + 来源。

**`skills/forge/lib/grill/instructions.md`**：
- §3 Core Loop 有 `checkGrillGlossaryConflicts` 约束
- §4 Output 写 findings 文件
- 有 `extractNewGlossaryCandidates` 纯函数

**`src/grill.ts`** 纯函数：
- `checkGrillGlossaryConflicts(tree, glossary, now?)` — 只能检测同义词冲突
- `extractNewGlossaryCandidates(tree, glossary)` — 提取新术语候选

**`skills/forge/lib/decide/instructions.md` §3.0**：
- `checkDecideGlossaryConflicts(candidateTerms, glossary)` — Round 1 前检测

**Gap**：

| 维度 | 当前状态 | Matt 的 CONTEXT.md 能力 |
|------|---------|------------------------|
| 术语定义 | ✅ 有 | ✅ 有 |
| 同义词 | ✅ 有（别名） | ✅ 有 |
| 禁用词 | ❌ 无 | ✅ 有（Avoid 列表） |
| 术语间关系 | ❌ 无 | ✅ 有（Relationships） |
| 歧义记录 | ❌ 无 | ✅ 有（Flagged ambiguities） |
| 示例用法 | ❌ 无 | ✅ 有（Example dialogue） |
| 冲突检测 | 只检测同义词 | 检测禁用词 + 语义矛盾 + 关系矛盾 |
| 实时维护 | grill 后批量写新术语 | grill 中**逐条**写入 |

### 修改拓扑

```
.tinkerman/glossary.md
  └── 每个条目追加可选字段（避免/关系/歧义记录）

skills/forge/lib/grill/instructions.md
  └── §3 Constraints 追加实时维护规则
  └── §4 Output 追加 Glossary Updates 段

src/grill.ts
  └── checkGrillGlossaryConflicts 增强

skills/forge/lib/decide/instructions.md
  └── §3.0 引用增强后的冲突检测
```

## Components and Interfaces

### Component 1: glossary.md 格式升级

**向后兼容**：旧格式条目仍然有效。新增字段为可选。

新增强格式：

```markdown
## <术语名>
**定义**: <一句话定义。描述它 IS 什么，不是它 DOES 什么>
**别名**: <可接受的同义词列表>（可选）
**避免**: <禁用的同义词列表及原因>（新增，可选）
**关系**: <与其他术语的关系>（新增，可选）
**歧义记录**: <曾经发生的歧义和解决结论>（新增，可选）
**更新**: <最后更新日期>
**来源**: <初始预置 / grill / decide / learn>
```

**字段说明**：

| 字段 | 必需 | 说明 |
|------|------|------|
| 定义 | ✅ | 一句话。描述 IS 不是 DOES |
| 别名 | 可选 | 可接受的同义词 |
| **避免** | 可选（新增） | 禁用的同义词及原因。Agent 输出中使用这些词时应警告 |
| **关系** | 可选（新增） | 与其他术语的关联。格式：`→ <术语>: <关系描述>` |
| **歧义记录** | 可选（新增） | 曾经有过的术语争论和结论。防止未来重新争论 |
| 更新 | ✅ | 最后更新日期 |
| 来源 | ✅ | 谁创建的 |

**示例升级**：

```markdown
## Spec
**定义**: 需求锁定的产物，位于 `.tinkerman/specs/<feature>/`，一旦 locked 即进入冻结区。
**别名**: 规格, 规格文档
**避免**: PRD（PRD 是产品需求文档，Spec 是技术规格，不是同一层级的产物）
**关系**: → Plan: Spec 被 Plan 拆解为原子任务; → Feature: Spec 锁定一个 feature 的需求
**歧义记录**: "spec" 曾与 "design doc" 混淆 — 结论：Spec 是需求规格（what），design doc 是技术设计（how），两者分离
**更新**: 2026-06-03
**来源**: glossary-enhancement
```

### Component 2: grill 实时 glossary 维护

在 `grill/instructions.md` §3 Core Loop 的 Constraints 列表中追加：

```markdown
- 术语澄清时**立即更新** `.tinkerman/glossary.md`，不要批量累积。
  当 grill 过程中：
  - 用户使用了一个不在 glossary 中的新术语 → 追加新条目（来源: grill）
  - 用户澄清了一个模糊术语 → 更新该条目的定义
  - 用户否定了某个同义词 → 追加 **避免** 字段
  - 发现两个术语的边界不清晰 → 追加 **歧义记录**
  - 揭示了术语间的新关系 → 追加 **关系** 字段
  不要耦合到实现细节——只包含对领域专家有意义的术语。
```

在 §4 Output 的 findings 文件 4 段格式后追加第 5 段：

```markdown
5. `## Glossary Updates` — 本次 grill 期间对 glossary 的变更列表
   - `+ <新术语>` / `~ <更新术语>` / `! <歧义记录>`
   无变更则 `none`
```

### Component 3: glossary conflict detection 增强

影响 `src/grill.ts` 的 `checkGrillGlossaryConflicts` 函数。

当前返回类型 `GrillConflictCheckResult` 增加 3 种检测类型：

| 检测类型 | 信号 | 行为 |
|---------|------|------|
| 同义词冲突（现有） | 用户用了 glossary 的别名 | 澄清用哪个 |
| **禁用词检测**（新增） | 用户/agent 输出中使用了 **避免** 列表中的词 | 警告 + 推荐替代 |
| **语义矛盾**（新增） | 用户对术语 X 的描述与 glossary 定义矛盾 | "你的 glossary 定义 X 为 Y，但你似乎指 Z" |
| **关系验证**（新增） | 用户描述的术语关系与 **关系** 字段矛盾 | 标记矛盾 |

`GrillConflictCheckResult` 类型扩展：

```typescript
interface GlossaryConflict {
  type: "synonym" | "avoided_term" | "semantic_mismatch" | "relation_violation";
  term: string;
  detail: string;
  suggestion: string;
}
```

### Component 4: decide §3.0 引用更新

`skills/forge/lib/decide/instructions.md` §3.0 的 `checkDecideGlossaryConflicts` 调用点不变，但底层函数增强后自动获得新检测能力。

需更新 §3.0 的文字说明，标注检测类型已扩展为 4 种。

## Edge Cases

| 情况 | 处理 |
|------|------|
| 旧格式 glossary 条目（无新增字段） | 正常工作，新检测类型对该条目返回空结果 |
| glossary 条目无 **避免** 字段 | 禁用词检测跳过该条目 |
| grill 过程中 glossary 写入失败 | fallback：记录到 findings 的 Glossary Updates 段，标注 `write_failed` |
| 关系字段引用不存在的术语 | 忽略，不报错（关系是信息性的） |

## Out of Scope

- 不引入独立的 `CONTEXT.md` 文件
- 不改变 glossary.md 的文件位置
- 不改变 `runGlossaryCheck` 的调用点（build commit、plan task breakdown）
- 不实现自动禁用词扫描脚本（依赖 prompt 约束）
- 不改变 `extractNewGlossaryCandidates` 的行为
