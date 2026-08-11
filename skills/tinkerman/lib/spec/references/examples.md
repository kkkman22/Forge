---
updated: 2026-08-11
---
# Spec 示例 / Examples

## Canonical Example: Greenfield

任务："为订单系统添加批量导出功能"

```markdown
---
feature: "order-batch-export"
status: "draft"
date: "2025-01-15"
---

## 目的
为运营人员提供按条件筛选并导出订单数据的功能，用于对账和报表。

## 需求

### 需求 1：按条件筛选导出
**场景**：
- 当选择"最近7天"并导出，则生成文件开始下载
- 当结果为空，则提示"没有符合条件的订单"

### 需求 2：大数据量导出
**场景**：
- 当超过10000条，则提示"导出任务已提交"后台处理
- 当完成，则通知+下载链接
- 当链接超24h，则失效

## 不做什么
不做模板自定义、定时导出、历史记录管理

## 反漂移声明
- 主目标：按条件筛选导出，大数据量异步处理
- 非目标：导出速度优化、格式丰富度
- 验证材料：至少一组筛选+导出的端到端测试 + 大数据量分支场景
```

## Brownfield Variant (额外章节)

在 Greenfield 基础上补充：

```markdown
## Current State
Related Modules:
| Module | Path | Current Behavior |
|--------|------|------------------|
| order-list | src/pages/orders/list.tsx:45 | 分页展示，无批量操作入口 |
| order-api | src/api/orders.ts:120 | 仅支持单条查询 |

## Proposed Change
**要改变的**：
- 在 order-list 增加"导出"按钮（入口行为）
- 在 order-api 增加批量导出端点（新能力）

**明确不改变的**：
- 订单列表的分页与筛选 UI
- 现有单条查询端点的行为与返回格式

## Reversibility
**Rollback Checklist**：
- 移除导出按钮
- 删除批量导出端点
- 清理后台任务表的 export_job 记录

**Mount Points**：
- 新按钮挂载在 order-list 工具栏右侧
- 新端点注册在 `/api/orders/export`

## Delta
- **新增**：批量导出按钮、批量导出 API、导出任务表
- **修改**：无
- **不变**：订单列表分页、筛选、单条查询行为
```
