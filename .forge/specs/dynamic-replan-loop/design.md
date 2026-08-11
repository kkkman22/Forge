# 动态重规划闭环 — 设计文档

## 概述

本设计建立 debug→build/plan 的正式状态转移（修复 scheduler 缺失的 debug 分支），新增 `failure_class` 区分"可修复 bug"与"方案假设失效"，在后者触发增量重规划。核心原则：**最小侵入现有 three-strike/debug 流程，新增一个对称的判定层而非改写既有逻辑；增量 replan 只改剩余 task，受 plan phase 既有门禁保护。**

## 设计决策

### D1: failure_class 字段加在 debug 文件 frontmatter，而非新的独立状态文件

- **问题描述**：`failure_class` 存在哪？
- **候选方案**：
  - A. 新建独立状态文件（如 `.forge/replan/<topic>.json`）。
  - B. 加在 `.forge/debug/<slug>.md` frontmatter。
- **选择理由**：选 B。debug 文件是失败诊断的权威载体，root_cause / resolution 已在那里。failure_class 是 root_cause 的分类，天然属于同一文件。新建独立文件增加文件数、制造两个真相源（debug 文件说 root_cause，replan 文件说 class）。frontmatter 加字段是 schema 兼容扩展（`.forge/debug/*.md` 解析已是宽松的）。
- **风险和缓解**：debug 文件由 debug skill 散文生成，字段格式靠 SKILL 指令约束（非 schema 强制）。缓解：scheduler 读 failure_class 时用 `?? "fixable_bug"` 容错（缺失默认可修复 bug，不误触发 replan）。

### D2: scheduler debug 分支用"读文件 + 规则分流"，不引入新事件系统

- **问题描述**：debug resolved 后怎么决定下一步？
- **候选方案**：
  - A. 新建事件总线（debug resolved 事件 → 订阅者分流）。
  - B. scheduler 的 `determineNextSkill` 新增 debug 分支，读 debug 文件 status+failure_class 规则分流。
- **选择理由**：选 B。Forge 的 phase 转移是单点的（`determineNextSkill` 是唯一决策入口），引入事件总线是过度设计且破坏现有单点决策架构。debug 分支只需读一个文件、跑一组 if/else，与现有 router→plan→build→review→test→ship 分支风格完全一致。
- **风险和缓解**：手动 `/forge debug`（非 three-strike 触发）也会进 scheduler？缓解：scheduler debug 分支只在 `previousPhase === "build"` 的链路生效（build→debug→?）；用户手动 debug 不经过 scheduler，不受影响（R2-AC 手动 debug 隔离）。

### D3: 增量 replan 复用 plan phase 的既有流程，不新建 replan skill

- **问题描述**：增量重规划是新 skill 还是复用 plan？
- **候选方案**：
  - A. 新建 `/forge replan` skill。
  - B. 复用 `/forge plan`，传入 `replan_mode` + `invalidated_assumptions`。
- **选择理由**：选 B。replan 的本质就是"重新 plan 剩余 task"，新建 skill 会与 plan 重复。复用 plan phase 天然继承 Spec Lock 门禁、frozen-zone 保护、用户批准门禁——这些正是 replan 需要的约束。只需让 plan 能识别"我是 replan 调用"（通过 status.md 的 `replan_pending` 标志），跳过已完成 task、只修订剩余。
- **风险和缓解**：plan 既要支持首次 plan 又要支持 replan，逻辑分叉。缓解：replan_mode 是 plan 内部一个分支，读取 `replan_pending` 后进入"增量"分支（过滤 completed task），首版不涉及的全量 plan 逻辑不受影响。

### D4: failure_class 判定保守化——默认 fixable_bug，用显式信号识别 assumption_invalidated

- **问题描述**：怎么判定一个失败是"bug"还是"假设失效"？误判代价不对称（误判为假设失效会打乱计划）。
- **候选方案**：
  - A. 让 debug agent 自动判定（基于 root_cause 文本分类）。
  - B. 保守默认 fixable_bug，只有明确信号才判 assumption_invalidated。
- **选择理由**：选 B。误触发 replan 打乱已批准计划，代价高于漏触发（漏触发最坏是连锁返工，但 three-strike 会再拦）。明确信号包括：debug 在 Phase 2 假设阶段发现"依赖的接口/服务不存在"、Phase 1 symptoms 明确指向"方案与现有架构冲突"、invalidated_assumptions 能对应到 router/status.md 的具体假设条目。这些是"可机器识别"的强信号，不依赖模糊的文本分类。
- **风险和缓解**：保守判定可能漏掉一些假设失效。缓解：replan 是渐进增强，首版宁可保守；debug skill 指令明确列举 assumption_invalidated 的典型场景，帮 debug agent 准确判定。

### D5: replan_pending 标志加在 status.md，利用 schema 的 .passthrough()

- **问题描述**：replan 的触发状态存哪？
- **候选方案**：
  - A. 新建 `.forge/replan-state.json`。
  - B. 复用 status.md，加 `replan_pending` + `invalidated_assumptions` 字段。
- **选择理由**：选 B。status.md 是 phase 状态的权威文件，replan 是一次 phase 转移（build→plan），状态本就该在 status.md。schema 已 `.passthrough()`（`status-file.ts:73`），加字段不破坏兼容。scheduler 和 plan 都已读 status.md，无需新增读取路径。
- **风险和缓解**：status.md 字段膨胀。缓解：replan_pending 是布尔瞬时标志（replan 完成后清空），invalidated_assumptions 是临时数组，不长期占用。

## 接口设计

### failure_class（debug 文件 frontmatter）

```yaml
---
slug: "<topic>"
status: "resolved"          # 已有
root_cause: "..."            # 已有
resolution: "..."            # 已有
failure_class: "fixable_bug" # 新增：fixable_bug | assumption_invalidated | environmental
invalidated_assumptions: []  # 新增（仅 assumption_invalidated 时）：被证伪的假设
---
```

### scheduler debug 分支（`skill-scheduler.ts` determineNextSkill）

```typescript
// 新增分支，插入在现有 if 链中
if (currentPhase === "debug") {
  const debugFile = readDebugFile(topic);  // 读 .forge/debug/<slug>.md frontmatter
  if (!debugFile) return { next: "build" }; // 容错：文件缺失回 build
  
  if (debugFile.status === "abandoned") return { next: "aborted" };
  
  if (debugFile.failure_class === "assumption_invalidated") {
    writeStatusReplanPending(debugFile.invalidated_assumptions); // status.md 标记
    return { next: "plan", replanMode: true };
  }
  
  // fixable_bug / environmental / 默认 → 回 build
  if (debugFile.failure_class === "environmental") {
    writeStatusEnvWarning(debugFile.root_cause);
  }
  return { next: "build" };
}
```

### plan 的 replan 分支（`skills/forge/lib/plan/instructions.md`）

```
WHEN status.md 的 replan_pending === "true":
  1. 读取 invalidated_assumptions
  2. 过滤剩余未完成 task（TaskSeed.status !== "completed"）
  3. 对受 invalidated_assumptions 影响的 task 重新设计（顺序/拆分/方案）
  4. 写回 .forge/plans/<topic>.md，标 replan 版本（replan_of + invalidated_assumptions）
  5. 等用户批准（plan phase 批准门禁）后回 build
  6. 清空 status.md 的 replan_pending
```

### status.md 新增字段

```yaml
replan_pending: "false"           # 新增：是否待重规划
invalidated_assumptions: []        # 新增：被证伪的假设（replan 时填，完成后清）
```

## 数据模型

新增/扩展的字段：

| 文件 | 字段 | 性质 |
|---|---|---|
| `.forge/debug/<slug>.md` | `failure_class` | 新增 frontmatter |
| `.forge/debug/<slug>.md` | `invalidated_assumptions` | 新增 frontmatter（条件） |
| `.forge/status.md` | `replan_pending` | 新增（瞬时，passthrough） |
| `.forge/status.md` | `invalidated_assumptions` | 新增（瞬时，passthrough） |
| `.forge/plans/<topic>.md` | `replan_of` / `invalidated_assumptions` | 新增 frontmatter（replan 版本标记） |
| `src/failure-sink.ts` | `replan_triggered` | 新增 FailureTrigger 枚举值 |

无新 TypeScript 类型破坏性变更。`failure_class` 作为字符串读取（容错 `?? fixable_bug`）。

## 风险

| 风险 | 缓解 |
|---|---|
| failure_class 误判打乱计划 | D4 保守判定，默认 fixable_bug；replan 需用户批准（D3） |
| scheduler debug 分支影响手动 debug | D2 分支仅在 build→debug 链路生效 |
| replan 后新计划又错 | 只改剩余 task，受 Spec Lock 门禁；three-strike 可再拦 |
| context 膨胀 | debug 诊断 write-and-discard，replan 只读 invalidated_assumptions 摘要 |
| 与 loop-engineering-adoption 耦合 | R4 复用 commit-narrative 是可选的，缺失则跳过 |
| status.md 字段膨胀 | replan_pending 是瞬时标志，完成后清空 |
