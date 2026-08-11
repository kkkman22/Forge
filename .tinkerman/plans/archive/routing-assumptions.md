---
topic: "routing-assumptions"
spec_ref: ".kiro/specs/routing-assumptions"
status: "approved"
created: "2026-05-01"
---

# Plan: Routing Assumptions

> 来源: `.kiro/specs/routing-assumptions`

## Objective

在 forge-router 路由分析输出中增加"假设"段落，将 Agent 基于项目扫描的隐式判断显式化；同时在 `ClassificationResult` 类型中增加 `assumptions` 字段。

## 改动范围

| 文件 | 改动类型 | 行数估算 |
|------|---------|---------|
| `src/router.ts` | 类型 + 默认值 | +3 行 |
| `skills/forge-router/SKILL.md` | 内容更新（§1, §2, §5） | +30 行 |
| `test/router.property.test.ts` | 新增属性测试 | +20 行 |

## 任务

### Task 1: router.ts 类型更新

- 1.1 `ClassificationResult` 接口增加 `assumptions: string[]` 字段（`hints` 之后）
- 1.2 `classifyTask` 返回值增加 `assumptions: []`

### Task 2: forge-router SKILL.md §2 输出模板更新

- 2.1 在"行为提示"段落之后、确认提示之前，增加"假设"段落
- 2.2 格式：编号列表 `N. <判断>（基于 <来源>）`，末尾 `→ 如有不符请纠正`
- 2.3 §1 Step 1 增加假设生成维度指导表

### Task 3: forge-router SKILL.md §5 状态文件更新

- 3.1 YAML frontmatter 模板增加 `assumptions` 字段（string array，optional）
- 3.2 标注可选性和下游引用说明

### Task 4: 属性测试

- 4.1 新增测试：`classifyTask` 返回值始终包含 `assumptions` 字段且类型为 `string[]`
- 4.2 验证默认值为空数组

### Task 5: 验证

- 5.1 `npm run check` 全量通过

## 依赖

```
Task 1 → Task 4（测试依赖类型定义）
Task 2, Task 3 独立（SKILL.md 改动）
Task 5 最后执行
```
