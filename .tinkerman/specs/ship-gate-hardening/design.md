---
feature: ship-gate-hardening
layout: design
created: 2026-05-29
---

# Ship 门禁加固 — 设计文档

## 概述

为 `/forge ship` 添加三道门禁（Review、Test、Progress），集成 P1 Fix Checklist，补齐 Fallback Ladder 实现，确保代码在经过充分验证后才能发布。

## 设计决策

### D1: 门禁为纯函数

所有门禁检查实现为纯函数：

```typescript
interface GateResult {
  gate: 'review' | 'test' | 'progress';
  passed: boolean;
  reason: string;
  details?: {
    p0Count?: number;
    p1Count?: number;
    untestedFiles?: string[];
    incompleteTasks?: string[];
  };
}

function checkReviewGate(reviewDir: string, latestCommitHash: string): GateResult;
function checkTestGate(testResultsDir: string, configCICheck?: string): GateResult;
function checkProgressGate(progressDir: string, featureName: string): GateResult;
```

纯函数优势：
- 可独立单元测试
- 不依赖运行时状态
- 结果可序列化写入 `.tinkerman/ship/` 供审计

### D2: 门禁执行流程

```
/forge ship
    │
    ├─ 1. 收集上下文（git hash, feature name, config）
    │
    ├─ 2. checkReviewGate()
    │   ├─ passed → 继续
    │   ├─ P0/P1 存在 → 阻断，输出未修复 issue 列表
    │   └─ 无 review → 阻断，提示运行 /forge review
    │
    ├─ 3. checkTestGate()
    │   ├─ passed → 继续
    │   ├─ 测试失败 → 阻断，输出失败测试列表
    │   └─ 无测试记录 → 阻断，提示运行测试
    │
    ├─ 4. checkProgressGate()
    │   ├─ 全部 completed → 通过
    │   └─ 有 in_progress → 警告（不阻断）
    │
    ├─ 5. 所有门禁通过 → 执行 ship 效果（merge/push/discard）
    │
    └─ 6. 写入门禁结果到 .tinkerman/ship/<run-id>-gates.json
```

### D3: Review 门禁详细逻辑

```
checkReviewGate(reviewDir, latestCommitHash):
  1. 扫描 reviewDir 中最新的 review 报告
  2. 解析报告中的 P0/P1 issue
  3. 检查 p1-fixlist.json（如果存在）
  4. 对每个 P1 issue，搜索 git log 中是否有 [fix P1] 前缀的 commit
  5. 全部 P1 有对应修复 → passed
  6. 存在未修复 P1 → 不通过，reason 包含未修复列表
  7. 无 review 报告 → 不通过，reason 提示运行 /forge review
  8. review 报告超过 5 commit 未更新 → passed + 警告
```

### D4: P1 Fix Checklist 格式

```json
{
  "runId": "20260529-143000",
  "p1Issues": [
    {
      "id": "P1-001",
      "title": "Missing error handling in branch-lifecycle.ts",
      "file": "src/branch-lifecycle.ts",
      "line": 42,
      "fixCommit": null
    }
  ],
  "allFixed": false
}
```

当 ship 检查时：
- 读取 fixlist
- 对每个 `fixCommit: null` 的 P1，搜索 `git log --oneline --grep="[fix P1]" -- <file>`
- 匹配到的 commit hash 填入 fixlist
- `allFixed: true` 时 Review 门禁通过

### D5: Fallback Ladder 实现

Ladder 逻辑嵌入 `/forge review` SKILL 中：

```markdown
## Review 执行策略选择

1. 检查 L0 条件：
   - 交互模式？
   - CLAUDE_CODE_WORKFLOWS=1？
   - tengu_workflows_enabled gate ON？
   - workflow 文件存在？
   - node --check 通过？
   - concurrency bridge 可用？
   → 全部满足 → 使用 workflow 模式，methodology: "workflow"

2. 任何 L0 条件失败 → L1
   → 使用 subagent-parallel，methodology: "subagent-parallel"

3. Subagent 不可用 → L2
   → 使用串行单 agent，methodology: "subagent-serial"

4. 所有级别不可用 → L3
   → 阻断 ship，输出错误信息
   → methodology: "unavailable"
   → **HARD-GATE: 主 agent 不顶替**
```

### D6: 门禁结果持久化

```json
// .tinkerman/ship/<run-id>-gates.json
{
  "runId": "20260529-143000",
  "feature": "ship-gate-hardening",
  "timestamp": "2026-05-29T14:30:00Z",
  "gates": [
    { "gate": "review", "passed": true, "reason": "All P0/P1 fixed", "details": { "p0Count": 0, "p1Count": 2 } },
    { "gate": "test", "passed": true, "reason": "All tests passing", "details": { "untestedFiles": [] } },
    { "gate": "progress", "passed": true, "reason": "All tasks completed", "details": { "incompleteTasks": [] } }
  ],
  "allPassed": true,
  "skipGate": null
}
```

### D7: --skip-gate 机制

在 SKILL 文档中定义：

```markdown
## 门禁跳过

### --skip-gate=<gate-name>
跳过指定门禁。可多次使用。
可选值: review, test, progress
示例: /forge ship --skip-gate=test

### --skip-gate=all --force
跳过所有门禁。需要 --force 二次确认。
仅在 CI/自动化场景使用。
交互模式下此选项被禁用。

### 跳过标记
跳过时 ship commit 消息中自动追加:
[skip-gate: <gate-name> reason=<reason>]
```

## 风险

| 风险 | 缓解 |
|------|------|
| 门禁过严导致开发体验下降 | Progress 门禁仅警告不阻断；--skip-gate 提供逃生路径 |
| Fixlist 与实际修复不匹配 | P1 fix commit 消息格式为约定，可在 config.md 中配置 |
| L3 误触发 | L3 条件明确且严格，需要全部级别不可用 |
