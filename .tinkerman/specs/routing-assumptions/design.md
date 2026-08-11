---
feature: routing-assumptions
layout: design
created: 2026-05-01
---

# Design Document: Routing Assumptions

## Overview

在 forge-router 的路由分析输出中增加"假设"段落，将 Agent 基于项目扫描做出的隐式判断显式化。同时在 `src/router.ts` 的路由结果类型中增加 `assumptions` 字段，支持 Forge Loop 程序化访问。

## Architecture

无架构变更。改动范围：1 个 SKILL.md + 1 个 TypeScript 模块。

## Components and Interfaces

### 1. 路由输出模板更新（forge-router/SKILL.md §2）

当前输出：
```
📋 路由分析

档位建议：<档位>
任务类型：<类型>
项目阶段：<阶段>
判定理由：<理由>
命令序列：<序列>
行为提示：<提示列表>

确认？或覆盖：light / standard / full
```

更新后输出：
```
📋 路由分析

档位建议：<档位>
任务类型：<类型>
项目阶段：<阶段>
判定理由：<理由>
命令序列：<序列>

行为提示：
  • <提示>

假设：
  1. <判断>（基于 <来源>）
  2. <判断>（基于 <来源>）
  3. <判断>（基于 <来源>）
  → 如有不符请纠正

确认？或覆盖：light / standard / full
```

### 2. 假设生成指导

路由器在 Step 1 分析任务描述时，应从以下维度生成假设：

| 维度 | 来源 | 示例假设 |
|------|------|---------|
| 技术栈 | package.json, .tinkerman/config.md | "测试框架为 Vitest（基于 package.json devDependencies）" |
| 影响范围 | 代码扫描, 任务描述 | "分页针对 GET /api/users 端点（基于路由扫描）" |
| 实现模式 | 现有代码模式匹配 | "使用 offset/limit 分页（基于项目已有的分页模式）" |
| 数据层 | 数据库 schema, ORM 配置 | "不涉及数据库 schema 变更（基于现有查询层）" |
| 棕地/绿地 | .tinkerman/specs/, 项目代码量 | "这是对现有功能的修改（基于项目已有代码）" |

假设数量：3-5 条。不足 3 条时不强制凑数，但至少包含技术栈和影响范围两个维度。

### 3. Status 文件更新（forge-router/SKILL.md §5）

```yaml
---
current_task: "<任务描述>"
tier: "standard"
task_type: "backend"
project_phase: "iteration"
phase: "plan"
hints: "<提示列表>"
assumptions:
  - "分页针对 GET /api/users 端点（基于路由扫描）"
  - "使用 offset/limit 分页（基于项目已有模式）"
  - "测试框架为 Vitest（基于 package.json）"
updated: "YYYY-MM-DD HH:mm"
---
```

### 4. router.ts 类型更新

```typescript
// 现有 RoutingResult 类型增加 assumptions 字段
export interface RoutingResult {
  tier: Tier;
  taskType: TaskType;
  projectPhase: ProjectPhase;
  hints: string[];
  assumptions: string[];  // 新增
}
```

`classifyTask` 函数返回值中 `assumptions` 默认为空数组 `[]`。实际假设内容由 SKILL.md 指导 Agent 在运行时生成，TypeScript 层只提供类型定义和默认值。

## Testing Strategy

### 单元测试

- `router.ts` 现有测试：验证 `assumptions` 字段存在且默认为空数组
- 新增属性测试：`classifyTask` 返回值始终包含 `assumptions` 字段（类型为 `string[]`）

### 合约测试

- contract.test.ts：验证 forge-router SKILL.md frontmatter 格式未变

### 人工验证

- 运行 `/forge <任务描述>`，确认输出包含假设段落
- 确认假设内容基于实际项目扫描，不是通用模板
