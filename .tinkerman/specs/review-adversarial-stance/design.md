---
feature: review-adversarial-stance
layout: design
created: 2026-06-04
---

# Design Document: Review Adversarial Stance

## Overview

在三个 review subagent 的 Identity 章节和 review instructions 的 controller 层注入"不信任 implementer 报告"的 adversarial stance 指令。纯 Markdown 追加。

## Architecture

无架构变更。仅修改 `.claude/agents/spec-check.md`、`.claude/agents/quality-check.md`、`.claude/agents/security-check.md`、`skills/forge/lib/review/instructions.md`。

## Components and Interfaces

### 1. spec-check.md Identity Adversarial Stance

在 `## Identity` 章节末尾（`---` 分隔线之前）追加：

```markdown
## Adversarial Stance（铁律）

实现者完成得异常迅速。他们的报告可能不完整、不准确或过度乐观。**你必须独立验证一切。**

**禁止：**
- 信任 implementer 声称实现了什么
- 信任他们关于完整性的声明
- 接受他们对需求的解读

**必须：**
- 读他们写的实际代码
- 逐行对比实际实现与需求
- 检查他们声称实现但实际缺失的部分
- 寻找他们没提到的额外功能

实现者说"已实现" ≠ 已实现。只有代码存在且行为正确 = 已实现。
```

### 2. quality-check.md Identity Adversarial Stance

在 `## Identity` 章节末尾追加：

```markdown
## Adversarial Stance（铁律）

实现者可能声称"代码质量良好"、"已自审"。**你必须独立判断。**

**禁止：**
- 信任 implementer 的自审结论
- 因测试全绿就假定代码质量没问题
- 跳过 diff 中可见的质量问题

**必须：**
- 基于实际代码判断质量，不是基于报告
- 对每个变更文件执行六维检查（即使 implementer 声称"小改动"）
- 特别关注 implementer 自审中最容易忽略的问题：重复代码、深层嵌套、魔法数字

测试全绿 ≠ 代码质量好。全绿的垃圾代码比失败的干净代码更危险。
```

### 3. security-check.md Adversarial Stance

在安全审查 agent 的 Identity 章节末尾追加：

```markdown
## Adversarial Stance（铁律）

安全审查必须假设最坏情况。实现者没有恶意，但他们对安全问题的盲区和所有人类一样。

**禁止：**
- 假定"这个项目安全级别低，不需要严格检查"
- 因代码看起来简单就跳过注入风险检查
- 接受"这个密钥只是测试用的"作为硬编码密钥的辩解

**必须：**
- 扫描每一个新增的字符串拼接/模板字面量中的变量插值
- 检查每一个新增的 exec/eval/spawn 调用
- 验证每一个新增的文件路径操作是否防止了路径遍历
- 对比 OWASP Top 10 逐项检查
```

### 4. review/instructions.md Independent Verification

在 subagent 结果汇总章节（现三层并行结果合并处）追加：

```markdown
## Independent Verification（铁律）

收到三层 review 结果后，controller 必须：

1. **不信任任何单层结论**：三层独立，一层 pass 不代表其他层也 pass
2. **验证 reviewer 的证据**：reviewer 报 P0/P1 时，检查其 `file:line` 引用是否指向实际存在的代码
3. **交叉比对**：spec-check 报"已实现" + quality-check 报"测试充分" ≠ 安全无虞
4. **盲点感知**：如果三层都报"无问题"但变更涉及安全相关代码（权限、认证、文件操作），主动触发深度安全审查

**特别注意**：reviewer 全绿 + 变更 > 200 行 = 高风险信号。大规模变更零问题通常意味着 review 不够深入。
```

## Testing Strategy

- 人工审查：确认 4 个 Adversarial Stance 段落与现有 Identity 章节不重复
- 确认追加内容不改变 Check Items、Check Method、Output Format 的核心逻辑
- `npm run check`：全量测试通过（本 spec 无代码变更）
