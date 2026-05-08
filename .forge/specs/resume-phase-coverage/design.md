# Design Document

## Introduction

本设计修复 Forge 在 context compaction 恢复后遗漏当前阶段 SKILL.md 步骤的系统性问题。三层防御：R4 evolved rule 注入 + forge-resume SKILL Reload 步骤 + 各阶段 SKILL.md Compaction Recovery Check 段落。

## Component 1: Evolved Rule R4

**文件**: `.forge/knowledge/evolved-rules.md`

**变更**: 新增 R4 规则，要求 compaction/session 恢复后必须重读当前 SKILL.md。

**设计要点**:
- SessionStart hook 自动注入（既有机制，无需修改）
- 与 R1/R2/R3 格式一致
- rule_count 3→4
- Confidence 0.9（高置信度，根因明确）

## Component 2: forge-resume SKILL Reload Step

**文件**: `skills/forge-resume/SKILL.md`

**变更**:
1. §2 新增 "SKILL Reload" 子段落，要求恢复后第一步读取 `skills/forge-{phase}/SKILL.md`
2. §4 自动定位追加 SKILL.md 读取步骤
3. §4.1 Auto-triggered Resume 扩展触发条件（增加 compaction 恢复信号）
4. §5 边界情况新增 compaction 恢复行
5. Common Rationalizations 表新增"不需要重读"反驳行

**设计要点**:
- 不改变 forge-resume 的外部契约
- SKILL Reload 是恢复后第一个操作，优先于 Restatement
- Restatement 仅限 build 阶段，SKILL Reload 适用于所有阶段
- Compaction 恢复信号检测：conversation summary 中的特定标记文字

## Component 3: 各阶段 SKILL.md Compaction Recovery Check

**文件**: `skills/forge-ship/SKILL.md`, `skills/forge-review/SKILL.md`, `skills/forge-test/SKILL.md`, `skills/forge-learn/SKILL.md`

**变更**: 每个文件在门禁检查之后、主操作之前新增 §N.5 "Compaction Recovery Check" 段落。

**设计要点**:
- 段落结构统一：IF compaction 恢复 → 重读本 SKILL → 确认未跳步 → 从中断点继续
- 正常流程不触发此段落（它是条件性自检，不是执行步骤）
- 每个阶段的具体检查内容对应各自步骤结构（如 ship 检查 AskUserQuestion，review 检查三层评审配置）

### 各阶段 Compaction Recovery Check 内容

| SKILL | 关键检查项 |
|-------|-----------|
| forge-ship | §4 AskUserQuestion 合并选项是否已执行 |
| forge-review | §3 三层评审 Subagent 配置是否完整 |
| forge-test | §2 测试执行命令是否与 SKILL 定义一致 |
| forge-learn | §2 五维度提取是否覆盖全部维度 |

## Component 4: 测试覆盖

**文件**: 扩展 `scripts/lint-evolved-rules.mjs`（既有），新增或扩展 SKILL.md 内容测试

**设计要点**:
- lint-evolved-rules.mjs 已验证 rule_count，R4 新增后自动覆盖
- SKILL.md 内容测试验证 Compaction Recovery Check 段落存在性
- forge-resume SKILL.md 测试验证 SKILL Reload 段落存在性
- 纯文本匹配测试，不涉及运行时逻辑

## Component 5: 文档

**文件**: `CHANGELOG.md`

**变更**: 新增 Unreleased 条目描述 compaction 恢复覆盖。

## 防御层次

```
Layer 1: R4 evolved rule（SessionStart 注入，每次会话生效）
    ↓ 如果被忽略
Layer 2: forge-resume SKILL Reload Step（恢复流程强制重读）
    ↓ 如果 forge-resume 未被触发（如 compaction 恢复）
Layer 3: 各阶段 SKILL.md Compaction Recovery Check（SKILL.md 内自检段落）
    ↓ 如果 SKILL.md 也未重读
（fallback: 用户手动发现问题，memory 记录防止再犯）
```

三层中 Layer 1 是最轻量的（每次会话自动注入），Layer 2 是最系统的（改造恢复流程），Layer 3 是最精准的（每个阶段的具体检查项）。三层互补，任一层失效后层仍可生效。
