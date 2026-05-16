---
status: locked
contract_legacy: true
created: "2026-05-14"
topic: atomic-task-depends-on-utilization
---

# Spec: AtomicTask dependsOn 字段利用与 plan 拆解逻辑增强

## 概述

`src/plan.ts` 的 `AtomicTask` 接口已有 `dependsOn?: number[]` 字段（同样适用于 `LightweightTask`），但当前 plan 拆解流程**不主动识别和填充依赖**，build / loop 也**不消费依赖信息**。本 spec 让 plan AI 在 Step 3 Task Breakdown 中显式分析任务依赖、填充 `dependsOn` 字段，并在 Step 4 Self-Check 中校验依赖图有效性。

不普及到 build / loop（task-graph 推广不在本 spec 范围）。本 spec 只做"plan 输出图数据"，让 graph 信息可用为下游评估提供基础。

## 动机

ROADMAP v2.2.1 L-16 标注：

> AtomicTask 缺少 dependsOn 字段 — plan.ts 无法表达任务间依赖

实际上字段已存在（`dependsOn?: number[]`），但：

1. **plan AI 不填充**：Step 3 拆解时不分析依赖，输出的 `dependsOn` 总是 `undefined` 或空
2. **Self-Check 不校验**：Step 4 五项检查不包含"依赖图有效性"
3. **下游不消费**：build 顺序执行任务，loop 不基于图调度

L-16 的真实问题不是"字段缺失"，是"字段未启用"。当前状态等同于"task-graph.ts 是孤儿模块"——纯函数库写好了但没消费者。

短期价值：
- plan 输出的图数据让 review 阶段能验证"任务顺序合理"
- 为未来任务并行执行（如真有需求）提供数据基础
- 让 plan self-check 多一层正确性保证

不做的事（明确范围）：
- 不在 build / loop 中实施并行执行（性能瓶颈在 LLM 推理，不在调度）
- 不普及 task-graph 库到生产代码消费

## 核心设计原则

- **零修改 AtomicTask schema**：`dependsOn?: number[]` 字段已存在，本 spec 仅启用
- **AI 显式分析依赖**：plan SKILL.md 的 Step 3 增加"任务依赖识别"步骤
- **Self-Check 增加图校验**：Step 4 调用现有 `validateGraph`（src/task-graph.ts）
- **保持向后兼容**：旧 plan（无 dependsOn）仍合法解析，只是缺少图信息
- **不强制并行执行**：本 spec 只输出图，不消费图

## Plan SKILL.md 增强

### Step 3 Task Breakdown — 依赖识别

新增子步骤"3.5: 识别任务依赖"，AI 在拆解任务后主动分析：

```
对每个任务 T_i，回答：
- T_i 的 RED 步骤是否需要 T_j (j < i) 已实现的内容？
  → 若是，T_i.dependsOn.push(T_j.taskNumber)
- T_i 的 GREEN 步骤是否需要 T_j 的产物？
  → 若是，同上
- T_i 是否仅在文档/配置层面，无运行时依赖？
  → dependsOn 留空数组 []

输出：每个任务的 dependsOn 字段填充完整（包括空数组）
```

依赖识别规则（写入 references/dependency-rules.md）：
- 同文件不同函数 → 一般有依赖（除非完全独立的工具函数）
- 跨文件 import 关系 → 依赖
- 测试任务依赖被测代码任务
- 文档任务通常无依赖

### Step 4 Self-Check — 图校验

新增第 6 项检查：**Dependency Graph Validity**

| Check | 调用 | 失败处理 |
|-------|------|---------|
| Graph 有效性 | `validateGraph({ tasks })` | 自动修正循环依赖 / 不存在引用，重新自检 |
| 拓扑可执行 | `topologicalOrder(graph)` 不抛异常 | 同上 |
| Reachability | 所有任务从 `getReadyTasks` 起步均可达 | 同上 |

调用现有 `src/task-graph.ts` 的纯函数（无需新增）：
- `validateGraph(graph): GraphValidation`
- `topologicalOrder(graph): TaskNode[] | null`
- `getReadyTasks(graph): TaskNode[]`

需要把 `AtomicTask` / `LightweightTask` 转换为 `TaskNode`：

```ts
// src/plan.ts （新增辅助函数）
export function toTaskGraph(tasks: AtomicTask[] | LightweightTask[]): TaskGraph
```

### Plan 文档格式更新

`references/atomic-task-format.md` 模板更新示例：

```markdown
### Task 3: 实现用户登录

**Depends On**: [1, 2]
**File**: src/auth/login.ts (CREATE)

**RED**: ...
```

`Depends On` 显式标注（即使为空）。

## Build / Review 的轻消费

虽然不普及 task-graph 库，但 build / review 可以**只读**消费图：

| 阶段 | 行为 |
|------|------|
| forge-build §3.2 标准路径 | 读 plan 时按 `topologicalOrder` 顺序执行（验证而非并行） |
| forge-review Layer 2 | 校验 commit 顺序与拓扑顺序一致 |

build / review 不需要导入 task-graph 库，只读 plan 中已经标注的 `dependsOn`。

## 文件影响

### 修改

- `src/plan.ts` — 新增 `toTaskGraph(tasks)` 辅助函数（约 30 LoC）
- `skills/forge-plan/SKILL.md` — Step 3 增加 3.5 子步骤；Step 4 增加 Dependency Graph Validity 检查
- `skills/forge-plan/references/atomic-task-format.md` — 模板增加 Depends On 示例
- `skills/forge-plan/references/lightweight-task-format.md` — 同上
- `skills/forge-plan/references/dependency-rules.md` — 新增（依赖识别规则）
- `skills/forge-build/SKILL.md` — §3.2 提及"按 dependsOn 拓扑顺序执行"
- `skills/forge-review/SKILL.md` — Layer 2 增加"commit 顺序与依赖图一致性"子项

### 新增

- `test/plan-depends-on.test.ts` — plan 输出 dependsOn 字段的契约测试
- `test/plan-graph-validation.test.ts` — Step 4 图校验的契约测试
- `test/plan-depends-on.property.test.ts` — PBT：toTaskGraph round-trip / 拓扑顺序保持

### 不变

- `src/task-graph.ts` 接口零修改
- `AtomicTask` / `LightweightTask` schema 零修改（字段已存在）
- 现有 plan 测试零回归

## 边界与约束

- **不实施并行执行**：build / loop 仍顺序执行，dependsOn 仅用于校验和文档化
- **不强制非空依赖**：纯文档任务、独立工具函数等可以 `dependsOn: []`
- **不破坏旧 plan**：existing plans 中无 dependsOn 字段时跳过图校验，仅输出 warning
- **AI 推理不可依赖 100% 准确**：依赖识别由 AI 完成，可能漏标；Step 4 自检可识别明显错误（如循环），但不能保证捕获所有遗漏
- **brownfield 任务依赖外部代码**：dependsOn 仅表达 plan 内任务间依赖，不表达对项目已有代码的依赖

## 风险与缓解（反模式对照）

| 反模式 | 是否风险 | 缓解 |
|--------|----------|------|
| 过度抽象 | 否 | 仅启用已有字段和已有库，不新增抽象 |
| 触发链过长 | 否 | 单 skill 内部增强，不引入跨 skill 触发 |
| 状态管理复杂度 | 否 | 无新增状态字段 |
| autonomous 硬阻塞 | 中 | 图校验失败 autonomous 模式自动修正（如剔除循环），interactive 模式询问用户 |
| 时间型缓存 | 否 | 无缓存设计 |

## 验收标准

1. `/forge plan` 拆解输出的 atomic task 中，每个任务都有 `dependsOn` 字段（可能为空数组）
2. plan Step 4 调用 `validateGraph` 校验图有效性，循环依赖自动修正
3. plan markdown 文档每个任务都显式标注 `**Depends On**: [...]`
4. 旧 plan（无 dependsOn 字段）仍能被 plan 解析器解析，输出 warning 但不阻断
5. forge-build 按拓扑顺序执行任务（与 plan 文档顺序对比，循环依赖时拓扑顺序优先）
6. forge-review Layer 2 检测 commit 顺序与依赖图不一致 → finding
7. autonomous 模式下图校验失败 → 自动修正 + advisory；interactive 模式询问用户
8. PBT 验证 `toTaskGraph` 是 round-trip 安全（plan 序列化后再解析图等价）
9. 现有 plan 测试零回归

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| AI 推理依赖不准 | 漏标或误标 | Step 4 self-check 校验明显错误（循环、不存在引用），用户可在 plan approval 阶段修正 |
| 旧 plan 与新 plan 混存 | 解析路径分叉 | 旧 plan 走 fallback path（不校验图），输出 deprecation warning |
| 增加 plan 阶段时间 | UX 退化 | 依赖识别是 AI 推理的子步骤，不增加额外 skill 调用 |
| review Layer 2 误报 | 增加噪音 | finding 仅在严重不一致时触发（如顺序完全反转），轻微偏差不报 |

## 实施顺序

1. **辅助函数**：实现 `toTaskGraph(tasks)`，单元测试覆盖
2. **Plan Step 3.5**：plan SKILL.md 增加依赖识别子步骤 + reference 文档
3. **Plan Step 4 校验**：调用 `validateGraph` + `topologicalOrder`
4. **Plan 文档模板**：atomic / lightweight 模板加 Depends On 示例
5. **Build 顺序校验**：build §3.2 引用 dependsOn 决定执行顺序
6. **Review Layer 2 校验**：commit 顺序与图对比
7. **PBT 覆盖**：round-trip + 拓扑保持 + brownfield 兼容
