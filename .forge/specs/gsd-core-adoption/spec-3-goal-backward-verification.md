# Spec 3: Goal-Backward 验证 — Adversarial Completion Audit

> 来源：open-gsd/gsd-core v1.4.4 `src/verify.cts` + `agents/gsd-verifier.md` + verification status seam
> 优先级：P1 | 影响范围：review instructions + spec-check agent + verification 模式
> 预估工作量：6-8h
> Forge 现状：⚠️ 部分借鉴 — adversarial stance + stub detection + confidence 已有，缺少 L3 Wired + L4 Data-Flow + must-haves merge + status matrix

---

## 评估结论（2026-06-12）

**⚠️ 部分值得借鉴。有 4 个明确可执行项，合计 5-7h。**

### ✅ 已有（无需开发）
- R1 adversarial stance — spec-check agent 已采用对抗性立场
- R8 stub detection — 已有 stub 模式列表
- `evidence_artifact_id` — 已有证据关联
- confidence 过滤（0.8 threshold）— 已有置信度过滤
- dedup pipeline — 已有去重
- P0/P1 block ship — 已有阻断机制
- fallback ladder L0-L3 — 已有降级阶梯

### ⚠️ 需要增强（可执行项）
| 工作项 | R# | 类型 | 影响文件 | 工作量 |
|--------|----|------|---------|--------|
| L3 Wired 检查（5 种 wiring 路径） | R2 | spec-check instructions (markdown) | `skills/forge/lib/review/instructions.md` | 2-3h |
| L4 Data-Flow 检查（端到端 trace） | R2 | spec-check instructions (markdown) | 同上 | 1-2h |
| Must-haves merge rule（plan 不能缩减 scope） | R4 | spec-check instructions (markdown) | 同上 | 1h |
| 状态矩阵（VERIFIED/HOLLOW/ORPHANED/STUB/MISSING） | R2 | spec-check instructions (markdown) | 同上 | 1h |

**注意**：R3 verification status seam、R5 behavioral spot-checks、R6 probe execution、R7 overrides 可以作为 spec-check instructions 的补充内容写入，不单独需要代码实现。

---

## 问题

当前 Forge 的 review 使用 **task-forward** 验证：检查"每个 task 是否完成"。但 **task 完成 ≠ 目标达成**。

| 场景 | Task-Forward 结果 | Goal-Backward 结果 |
|------|------------------|-------------------|
| 迁移只改了类型注解，运行时仍用旧类型 | ✅ task "更新类型" 完成 | ❌ goal "类型安全" 未达成 |
| 测试写了但只测 happy path | ✅ task "写测试" 完成 | ❌ goal "边界覆盖" 未达成 |
| API endpoint 创建了但没有调用方 | ✅ task "创建 API" 完成 | ❌ goal "端到端可用" 未达成 |
| SUMMARY 声称"已验证"但无证据 | ✅ task 标记完成 | ❌ goal "可验证" 未达成 |

**核心原则**：Task completion ≠ Goal achievement。

### v1.4.4 新增 vs v1.3.0

| 特性 | v1.3.0 | v1.4.4 |
|------|--------|--------|
| 验证状态 | pass/fail 二元 | **passed \| gaps_found \| human_needed** 三态 |
| 验证查询 | 无统一接口 | **`verification.status` 单一 seam** |
| Must-haves | 无合并规则 | **plan 不能缩减 ROADMAP scope** |
| Spot-checks | 全量运行 | **枚举测试 + 单个运行**（非 full suite） |
| Probe execution | 无 | **迁移阶段 probe 验证** |
| Overrides | 无 | **80% token overlap matching** |

## 需求

### R1: Adversarial Stance（对抗性立场）

验证者（spec-check agent）必须采用**对抗性立场**：

```
验证者的默认假设：
  1. 假设 SUMMARY 的声明是假的——直到被证据证实
  2. 假设"已完成"的 task 实际上是 stub——直到看到实质内容
  3. 假设 API 有调用方——但可能没有 wiring
  4. 假设测试覆盖了边界——但可能只测了 happy path

验证者必须做的事：
  1. 逐条对照 spec requirements，不信任 SUMMARY
  2. 对每个声称"已实现"的功能，找到对应的代码文件和行号
  3. 对每个声称"已测试"的功能，找到对应的测试文件并确认非 stub
  4. 对每个声称"已 wired"的功能，追踪 import 链和 callsite
```

### R2: 4-Level Artifact Verification

每个声称完成的 artifact 必须通过 4 级验证：

```
L1: Exists（存在性）
  → 文件存在于文件系统中？
  → grep 能找到关键标识符？
  → 方法：fs.existsSync / grep

L2: Substantive（实质性）
  → 不是 stub？（return null / return {} / TODO / FIXME / hardcoded / not-implemented）
  → 有实际业务逻辑？
  → 方法：read file content, check for stub patterns

L3: Wired（连接性）
  → 被 import 了？
  → 有 callsite？（Component→API, API→DB, Form→Handler, State→Render, Event→Action）
  → 方法：grep import statements, find references

L4: Data-Flow（数据流）
  → 端到端数据流通畅？
  → 没有 hardcoded override 绕过逻辑？
  → 方法：trace data path from input to output

验证状态矩阵：
  L1✓ L2✓ L3✓ L4✓ → VERIFIED（验证通过）
  L1✓ L2✓ L3✓ L4✗ → HOLLOW（wired 但无数据流）
  L1✓ L2✓ L3✗     → ORPHANED（存在但未 wired）
  L1✓ L2✗         → STUB（存在但是 stub）
  L1✗             → MISSING（不存在）
```

### R3: Verification Status Seam

统一的验证状态查询接口（v1.4.4 新增）：

```
verification.status 查询返回：
{
  status: "passed" | "gaps_found" | "human_needed",
  next_action: string,       // 建议的下一步操作
  next_command: string,      // 建议的下一个命令
  gaps: Gap[],               // 发现的差距列表
  coverage: number           // 覆盖率百分比
}

状态定义：
  passed      → 所有 must-haves 验证通过，可进入下一阶段
  gaps_found  → 发现差距，需要修复后重新验证
  human_needed → 存在验证者无法自动判断的项目，需要人工确认

parity rule：新增的 verification status 必须有对应的 route，
否则 parity test 失败。
```

### R4: Must-Haves Merge Rule

Plan 不能缩减 ROADMAP/spec 的 scope：

```
合并规则：
  1. Plan 的 must-haves 必须是 ROADMAP must-haves 的超集或等集
  2. 如果 plan 删除了 ROADMAP 中的 must-have → BLOCKER
  3. 如果 plan 新增了 must-have → 允许（plan 可以更严格）
  4. Scope reduction = Dimension 7b BLOCKER in plan-checker

检测方法：
  1. 提取 spec/ROADMAP 中的所有 "must" / "必须" / "shall" 语句
  2. 提取 plan 中的所有 must-have items
  3. 集合差集 = ROADMAP.must_haves - plan.must_haves
  4. 差集非空 → scope reduction detected → BLOCKER
```

### R5: Behavioral Spot-Checks

不运行完整测试套件，而是针对性 spot-check：

```
Spot-Check 策略：
  1. 枚举 spec 中提到的所有行为/功能
  2. 为每个行为找到对应的测试文件
  3. 运行单个测试（不是 full suite）
  4. 验证测试结果

为什么不运行 full suite？
  - Full suite 通过不代表每个行为都被测试
  - 单个测试运行更快，反馈更精确
  - 可以精确定位"声称测试但实际未覆盖"的 gap

命令示例：
  vitest run path/to/specific.test.ts -t "should handle edge case"
```

### R6: Probe Execution（迁移阶段专用）

对于涉及数据迁移的阶段，必须进行 probe execution：

```
Probe Execution：
  1. 在迁移前后各运行一次 probe query
  2. 对比结果是否一致（或符合预期变化）
  3. probe query 应覆盖：
     - 数据完整性（行数对比）
     - 数据正确性（抽样值对比）
     - 性能不退化（查询时间对比）

适用场景：
  - 数据库 schema 迁移
  - 数据格式转换
  - API 响应格式变更
  - 文件格式迁移
```

### R7: Verification Overrides

当验证者无法完全自动判断时，使用 override 机制：

```
Override 规则：
  1. Token overlap matching：如果验证者的分析覆盖了 ≥80% 的 spec tokens → 可判定 passed
  2. 低于 80% → human_needed
  3. Override 必须记录原因和覆盖率
  4. Override 不适用于 P0/P1 级别的 must-haves

Deferred Items 机制：
  - 如果某个 must-have 暂时无法验证（如需要部署环境）
  - 标记为 deferred，记录原因和预计验证时间
  - deferred items 不阻塞当前阶段，但必须在后续阶段验证
  - 所有 deferred items 汇总到 verification.status.gaps
```

### R8: Stub Detection 模式

验证者检查的 stub 模式列表：

```
Stub Patterns：
  - return null / return undefined / return {} / return []
  - return true（无条件的硬编码返回）
  - TODO / FIXME / HACK / XXX / not-implemented
  - 空函数体（仅有一行 return）
  - 硬编码数据替代真实逻辑
  - console.log 但无实际逻辑
  - if (true) / if (false)（死分支）
  - 注释掉的实现代码
```

## 设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 验证方向 | task-forward / goal-backward | goal-backward | task 完成不等于目标达成 |
| 验证状态 | pass/fail / 三态 | 三态（passed/gaps_found/human_needed） | 现实中有"无法自动判断"的中间态 |
| 测试策略 | full suite / spot-check | spot-check | 精确反馈，不浪费时间 |
| Must-haves | 可缩减 / 不可缩减 | 不可缩减（plan 只能更严格） | 防止 plan 偷偷减少 scope |
| Override 门槛 | 50% / 80% | 80% token overlap | 高门槛避免误判 |

## 验收标准

- [ ] R1 adversarial stance 写入 spec-check agent instructions
- [ ] R2 4-level artifact verification（L1-L4）实现
- [ ] R3 verification status seam（passed/gaps_found/human_needed）
- [ ] R4 must-haves merge rule + scope reduction detection
- [ ] R5 behavioral spot-check 策略文档化
- [ ] R6 probe execution（迁移场景）规则定义
- [ ] R7 verification overrides（80% overlap）+ deferred items 机制
- [ ] R8 stub detection 模式列表
- [ ] `npm run check` 通过
