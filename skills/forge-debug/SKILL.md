---
name: forge-debug
description: "调试引擎。四阶段结构化根因分析（调查→分析→验证→修复）。"
disable-model-invocation: true
---

# /forge debug — 调试引擎

> **触发方式**：`/forge build` 连续失败 3 次自动触发，或用户直接输入 `/forge debug`
> **职责**：结构化的四阶段根因分析，避免"试试改改"的低效调试方式
> **输出路径**：`.forge/debug/<topic>.md`

---

## 1. 概述

`/forge debug` 以四阶段流程强制按"调查 → 分析 → 验证 → 修复"顺序推进。阶段之间不可跳跃。

**核心原则**：先理解问题，再解决问题。没有完成根因调查就提出修复方案 = 在黑暗中开枪。

**铁律**：Phase 1 未完成 → 不能提出修复方案。不可协商。

---

## 2. 四阶段流程

### Phase 1 — 根因调查（禁止提出修复方案）

完整理解问题，建立事实基础：

1. **完整阅读错误信息**：整个错误栈、日志输出和相关上下文
2. **稳定复现**：找到可靠复现步骤，确保非偶发
3. **检查最近变更**：Git 提交、文件变更，定位可能引入问题的变更
4. **追踪数据流**：从输入到输出，找到数据异常节点

**产出**：`.forge/debug/<topic>.md`（status: "investigating"），含错误信息、复现步骤、最近变更、数据流追踪、初步假设。

### Phase 2 — 模式分析

通过对比和历史经验缩小根因范围：对比正常代码 → 搜索 `.forge/knowledge/known-failures.md` 匹配已知模式（匹配到则展示历史方案）→ 搜索 `.forge/knowledge/solutions/` → 模式匹配缩小假设。

### Phase 3 — 假设验证

逐一验证假设，找真正根因。**每次只验证单一假设 + 最小改动**。同一假设连续验证失败 3 次 → 停止修复，质疑架构（→ 遵循 CLAUDE.md §2.4 三次换路）。

### Phase 4 — 修复验证

TDD 方式实施：RED（写复现测试确认失败）→ GREEN（最少代码通过）→ 确认无新问题（全量测试）。产出：debug 文档 status: "resolved"。

修复完成后：`💡 要记录这个解决方案吗？（/forge learn 或跳过）`。`mode: autonomous` 时跳过提示。

---

## 3. 红旗信号列表

| 红旗信号 | 建议行动 |
|---------|---------|
| 修复一个问题引入两个新问题 | 回到 Phase 1 重新调查 |
| 同一假设连续失败 3 次 | 停止修复，质疑架构 |
| 修复代码越来越复杂 | 考虑更高层架构变更 |
| 无法稳定复现问题 | 增加日志，收集更多数据 |
| 错误信息与代码逻辑不匹配 | 重新追踪数据流 |
| 修复后测试通过但行为仍异常 | 补充更多测试场景 |

---

## 4. 执行流程

1. **Phase 1**：根因调查（禁止修复方案）→ 产出一个或多个假设
2. **Phase 2**：模式分析 → 缩小假设范围
3. **Phase 3**：假设验证 → 单一假设 + 最小改动，3 次失败停止
4. **Phase 4**：修复验证 → RED/GREEN/全量测试 → resolved
5. 修复完成 → 提示 `/forge learn`（autonomous 跳过）

---

## 5. 边界情况处理

| 条件 | 处理 |
|------|------|
| 问题无法复现 | ⚠️ 可能竞态/环境问题。增加日志、检查并发、对比环境 |
| Phase 1 尝试提出修复 | 🚫 先完成所有调查步骤 |
| 所有假设都失败 | ⚠️ 回 Phase 1 重新收集信息、扩大调查范围 |
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init |

---

## 6. 示例

### Canonical：四阶段调试

```
$ /forge debug

━━━ Phase 1 — 根因调查 ━━━
📖 TypeError: Cannot read properties of undefined (reading 'map')
   at ExportService.processOrders (src/services/export.ts:42)
🔄 复现率：100%（status 为 null 时必现）
📝 新增 status 过滤逻辑，未处理 null 值
🔍 db.query({ status: null }) → 返回 undefined（而非空数组）

━━━ Phase 2-3 — 模式分析 + 假设验证 ━━━
📚 匹配：null-parameter-handling.md (confidence: 0.7)
✅ 验证假设 A：query 方法添加 null 检查 → 问题消失

━━━ Phase 4 — 修复验证 ━━━
🔴 test("should return empty array when status is null") → FAIL ✅
🟢 db.query 添加 null 参数过滤 → PASS ✅
🧪 全量测试 → 42/42 passed ✅

✅ 根因：db.query 未处理 null 参数 | 修复：查询层统一过滤 null
💡 要记录这个解决方案吗？（/forge learn 或跳过）
```
