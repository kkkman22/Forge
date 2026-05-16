---
status: locked
contract_legacy: true
created: "2026-05-14"
topic: failure-sink-trigger-expansion
---

# Spec: Failure-Sink 触发面扩张

## 概述

`src/failure-sink.ts` 是 Forge 已落地的能力库范式（IO-free 纯函数 + 三个失败 trigger，被 build/review/ship 共用）。本 spec 仅扩展其 `FailureTrigger` 枚举，新增 5 个被遗漏的失败场景到自动 episode 沉淀机制中：debug 完成 / grill 中止 / test layer 失败 / fix-conflicts 验证失败 / loop 熔断器触发。

不改 driver 接口，不动调用方既有逻辑，零回归。

## 动机

`failure-sink.ts` 当前覆盖三个 trigger：

| Trigger | 触发位置 | 状态 |
|---------|----------|------|
| `three_strike` | forge-build 三次连续 TDD 失败 | ✅ 已接入 |
| `new_review_pattern` | forge-review 发现新问题模式 | ✅ 已接入 |
| `ship_gate_blocked` | forge-ship 门禁拦截 | ✅ 已接入 |

下列失败场景 **本应沉淀但未接入**：

| 缺失 trigger | 触发位置 | 当前行为 |
|--------------|----------|----------|
| `debug_resolved` | forge-debug Phase 4 完成 | 仅写 `findings/debug-<topic>.md`，未生成 episode |
| `grill_abandoned` | forge-grill 用户中止 | 仅写 `status.phase = "grill_abandoned"`，无 episode |
| `test_layer_failed` | forge-test Layer 1/2/3 任一失败 | 仅 stdout 输出，无 episode |
| `conflict_validation_failed` | fix-conflicts validation gate 失败（连续 3 次失败已升级 debug，但前 2 次失败也是有价值的失败信号） | 无沉淀 |
| `loop_circuit_broken` | forge-loop 熔断器触发（连续错误超阈值） | 仅写 run 状态 `aborted`，未生成 episode |

后果：`evolution-report.md` 系统弱点视图不完整；R16 使用率评估的失败维度数据缺失；learn 阶段难以聚合实际失败模式。

## 核心设计原则

- **零接口变更**：`FailureContext` / `FailureTrigger` 当前 union 通过加成员扩展，已有调用方零修改
- **零 driver 改造**：扩展后五个新 trigger 由各自 skill 的 driver 层在已知失败点 emit
- **lessonFor 映射统一管理**：每个新 trigger 在 `lessonFor` switch 中追加 case，编译期保证完备性
- **失败粒度可调**：每个新 trigger 可附 `rootCause` 字段（已有），区分硬失败与软失败
- **沉淀写失败降级**：维持 R8.12 现有约定——episode/marker 写入失败仅 `console.warn`，不阻塞主流程

## 扩展契约

### FailureTrigger union 扩展

```ts
// src/failure-sink.ts
export type FailureTrigger =
  | "three_strike"               // 已有
  | "new_review_pattern"         // 已有
  | "ship_gate_blocked"          // 已有
  | "debug_resolved"             // 新增
  | "grill_abandoned"            // 新增
  | "test_layer_failed"          // 新增
  | "conflict_validation_failed" // 新增
  | "loop_circuit_broken"        // 新增
```

### lessonFor 映射扩展

| Trigger | Lesson 文本（中文） |
|---------|--------------------|
| `debug_resolved` | "调试虽已结束，记录根因模式以便后续识别相同症状" |
| `grill_abandoned` | "需求澄清中止，未完成边界对齐——后续返工风险升高" |
| `test_layer_failed` | "测试 layer 失败暴露代码与 spec 之间的偏差，值得作为模式沉淀" |
| `conflict_validation_failed` | "冲突解决后验证未通过，提示合并策略或测试覆盖不足" |
| `loop_circuit_broken` | "Forge Loop 熔断暴露循环目标可能不可达或方法未收敛" |

### Driver 层接入点

| Skill | 接入点 | trigger | rootCause 来源 |
|-------|--------|---------|----------------|
| forge-debug | Phase 4 完成 / 状态转 `resolved` 时 | `debug_resolved` | findings/debug-<topic>.md 中的 root_cause 字段 |
| forge-grill | `grill_abandoned` 状态写入时 | `grill_abandoned` | partial decision tree 中的最后一个 pending node 描述 |
| forge-test | Layer 1/2/3 任一 layer FAIL 时 | `test_layer_failed` | 失败 layer 名 + 关键失败 case 列表 |
| fix-conflicts hook | validation gate 单次失败时（不是 3 次升级） | `conflict_validation_failed` | check 命令 stderr 摘要 |
| forge-loop | 熔断器触发 / run 状态转 `aborted` | `loop_circuit_broken` | 最近 N 次错误的归类（指数退避达上限 / 同错误重复） |

## 双模式行为

| 模式 | 行为 |
|------|------|
| autonomous | 全部 5 个新 trigger 自动 emit episode + Evolution marker，无任何确认 |
| interactive | 同上。失败沉淀对用户透明（写入 `.forge/knowledge/sessions/<date>-<topic>.md`），不打断流程 |

failure-sink 的设计就是"sink as side-effect"，不需要双模式分流。

## 频率控制

- 同一会话同一 trigger 不限次数（每个 episode 都有 `id = ep-YYYY-MM-DD-NNN`，sequenceInDay 递增）
- 但 driver 层应避免重复 emit：例如 `loop_circuit_broken` 在熔断器触发那一刻 emit 一次，run 进入 aborted 后不再 emit
- `grill_abandoned` 每次 grill session 中止 emit 一次（resume 后再次中止再 emit 一次）

## 文件影响

### 修改

- `src/failure-sink.ts` — `FailureTrigger` union 加 5 个成员；`lessonFor` switch 加 5 个 case（约 +20 LoC）
- `src/debug.ts` — Phase 4 完成路径 emit `debug_resolved` failure-sink 调用
- `src/grill.ts`（driver 层） — `grill_abandoned` 状态写入路径 emit
- `src/test-runner.ts` 或对应 layer 失败处理位置 — emit `test_layer_failed`
- `src/conflict-resolver.ts`（依赖 conflict-resolver-hook spec 完成） — validation gate 单次失败 emit
- `src/orchestrator.ts` 或 `src/sdk-driver.ts` — 熔断器触发 emit `loop_circuit_broken`
- `skills/forge-debug/SKILL.md` — Phase 4 章节增加"自动 episode 沉淀"说明
- `skills/forge-grill/SKILL.md` — `grill_abandoned` 章节同上
- `skills/forge-test/SKILL.md` — Layer 1/2/3 失败章节同上
- `skills/forge-loop/SKILL.md` — 熔断器章节同上

### 新增

- `test/failure-sink-extended-triggers.test.ts` — 5 个新 trigger 的单元测试
- `test/failure-sink-extended-triggers.property.test.ts` — PBT：扩展 trigger 后 episode 生成幂等性、lesson 完备性
- `test/failure-sink-driver-integration.test.ts` — driver 层接入的契约测试

### 不变

- `src/episode.ts` — episode 结构零修改
- `src/evolution-marker.ts` — marker 解析零修改
- 已有 3 个 trigger 的所有调用方零修改
- forge-learn evolution-report 聚合逻辑零修改（自动消费新 trigger 的 marker）

## 边界与约束

- **不引入新 outcome**：所有新 trigger 仍 outcome=failure；不创建 outcome=warning / partial
- **不强制每个失败都有 rootCause**：rootCause 为可选字段（已有约定），driver 在能确定根因时填，否则留空
- **不阻塞主流程**：episode/marker 写入失败仅 warn，已有 R8.12 约定继续生效
- **写失败 fallback 路径**：`.forge/knowledge/sessions/<date>-<topic>.md` 写不进时，episode 序列化为 stderr JSON 一行（用于 stop hook 后处理）
- **不影响 learn 阶段调度**：learn 阶段消费 marker 的逻辑不变；新 trigger 的 marker 自动出现在 evolution-report

## 验收标准

1. forge-debug Phase 4 写入 `findings/debug-<topic>.md` 并将 status 转 resolved 时 → 自动 emit 一条 `debug_resolved` episode 到 `.forge/knowledge/sessions/<date>-<topic>.md`
2. forge-grill 用户中止 → status 写入 `grill_abandoned` 同时 → 自动 emit 一条 `grill_abandoned` episode
3. forge-test 任一 Layer 失败 → 自动 emit 一条 `test_layer_failed` episode，body 含失败 layer 名和关键 case
4. fix-conflicts validation gate 单次失败 → emit `conflict_validation_failed`；连续 3 次失败仍走原 debug 升级路径
5. forge-loop 熔断器触发 → emit `loop_circuit_broken` episode；run 状态转 `aborted` 时不重复 emit
6. 新 trigger 与已有 3 个 trigger 共存于同一日同一 topic 时，episode id 序列单调递增（sequenceInDay 不冲突）
7. evolution-report.md 自动包含新 trigger 的 marker 聚合，按 `<skill>#<trigger>` 分组
8. 所有 5 个新 trigger 在 `lessonFor` 中有非空映射（编译期通过 union 完备性检查保证）
9. 写失败时（如目录不存在）输出 `console.warn` 而非抛出异常
10. 已有 3 个 trigger 的现有测试零修改通过

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 新 trigger 的 driver emit 点遗漏 | 失败场景仍未沉淀 | driver 层接入点单独写契约测试，覆盖每个新 trigger |
| `loop_circuit_broken` 在 race condition 下被 emit 两次 | 重复 episode | driver 层使用 idempotency key（runId + 'circuit-broken'） |
| evolution-report 噪音过多 | 日报体积膨胀 | learn 阶段已有聚合阈值（≥ 3 markers per `<skill>#<trigger>` 才提议 ADR），噪音自然衰减 |
| `grill_abandoned` 在 resume 后 re-emit 与原 emit 内容不同 | 同一会话重复记录 | driver 层在 emit 前检查最近 episode（同 session_id + 同 trigger）去重 |
| 外部 driver 误调（其他 skill 复用 trigger） | 语义混淆 | `FailureTrigger` 加注释明确每个 trigger 的合法 source |

## 实施顺序

1. **基础扩展**：`failure-sink.ts` 加 5 个 enum + lessonFor case + 单元测试
2. **debug 接入**：driver 层 emit `debug_resolved`，契约测试
3. **grill 接入**：emit `grill_abandoned`，含 resume 去重逻辑
4. **test 接入**：emit `test_layer_failed`，记录 layer + case 摘要
5. **loop 接入**：emit `loop_circuit_broken`，与熔断器协调
6. **fix-conflicts 接入**：依赖 conflict-resolver-hook spec 实施完毕
7. **文档对齐**：5 个 SKILL.md 加自动沉淀说明
