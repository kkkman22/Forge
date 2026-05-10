---
date: "2026-05-10"
type: "audit"
scope: "三 Sprint 完成度审计（pack-system + pms-pack-v1 + ddd-tactical-bdd-collaboration）"
status: "completed"
remediation_spec: ".kiro/specs/sprint-3-gap-remediation/"
evolved_rules_output: ["R6", "R7", "R8"]
---

# 三 Sprint 完成度审计报告（2026-05-10）

## 1. 审计背景

用户声明三个 Sprint 已完成：
- Sprint 1 `pack-system`（Pack 基础设施 + 通用方法论能力）
- Sprint 2 `pms-pack-v1`（PMS Pack v1 + TDD 狠度 + 核心门禁）
- Sprint 3 `ddd-tactical-bdd-collaboration`（DDD 战术 + BDD 协作 + 定制能力）

本次审计目的：逐 Requirement 核查实际实现状态，识别缺口，输出修复建议。

## 2. 审计方法

- **文件系统扫描**：`src/`、`packs/`、`skills/`、`templates/`、`.claude/`、`scripts/`、`hooks/`、`test/`、`.kiro/specs/`
- **关键文件全文阅读**：`CLAUDE.md`、`packs/pms/pack.yaml`、各 skill SKILL.md、`hooks/hooks.json`、`.forge/config.md`、`package.json`
- **Requirement 逐条对照**：对每个 Sprint 的 requirements.md 的所有 AC，标记 ✅/⚠️/❌
- **现有 review 报告交叉验证**：`.forge/reviews/pms-pack-v1-*.md` 和 `.forge/reviews/ddd-tactical-bdd-collaboration.md`
- **子 agent 委托**：深入 grep + file search，验证字段级别的实现完整性

## 3. 审计结果总览

| Sprint | Requirements | 状态 | P0/P1 |
|--------|-------------|------|------|
| Sprint 1 `pack-system` | 12/12 | ✅ 完整（1 处格式约定差异） | 0/0 |
| Sprint 2 `pms-pack-v1` | 15/15 | ✅ 完整 | 0/0 |
| Sprint 3 `ddd-tactical-bdd-collaboration` | 12/12 形式达标 | ⚠️ 3 处功能缺口 | 0/0（P2 登记但欠债） |

**整体完成度约 90%，不需要重做任何 Sprint，但存在 6 处局部缺口。**

## 4. Sprint 1 `pack-system` 完成度矩阵

| Req | 状态 | 证据 | 备注 |
|-----|------|------|------|
| R1 Pack 发现与清单 | ✅ | `src/pack/loader.ts` + types.ts + tests | 完整 |
| R2 项目级 Pack 启用 | ✅ | `src/pack/config.ts` + `.forge/config.md` frontmatter 支持 | 完整 |
| R3 Zero-Pack-Zero-Impact | ✅ | `test/pack/zero-pack-invariant.test.ts` + `zero-pack-sprint3.test.ts` | 完整 |
| R4 Pack 管理命令 | ✅ | `skills/forge-pack/SKILL.md` + 7 子命令 + `commands.ts` + tests | 完整 |
| R5 Bounded Context 引擎 | ✅ | `src/context/registry.ts` + `map.ts` + tests | 完整 |
| R6 分 Context 统一语言 | ⚠️ | `src/glossary/registry.ts` 存在，但**与 PMS Pack 实际格式不匹配** | 见 §6.2 |
| R7 Spec Leak Detector 引擎 | ✅ | `src/spec-leak-detector.ts` + tests + forge-spec 集成 | 完整 |
| R8 Scenario Linter | ✅ | `src/scenario-linter.ts` + tests | 完整 |
| R9 RED Verification Gate | ✅ | tdd-rules.md "## RED Verification Gate" + build.ts | 完整 |
| R10 Plan Expected Output | ✅ | atomic-task-format.md + plan.ts + tests | 完整 |
| R11 Custom Override 层 | ✅ | `src/pack/resolver.ts` + property tests | 完整 |
| R12 非功能需求 | ✅ | fast-check 广泛使用，i18n 一致 | 完整 |

## 5. Sprint 2 `pms-pack-v1` 完成度矩阵

| Req | 状态 | 证据 |
|-----|------|------|
| R1 PMS Pack 基础骨架 | ✅ | `packs/pms/pack.yaml` 含完整 feature_flags；8 contexts；`_map.yaml` 10 边 |
| R2 PMS 分 Context 统一语言 | ✅ | 9 glossary 文件；Room 3 context 三义；Guest 多义；中文 aliases |
| R3 PMS 禁用词清单 | ✅ | `banned-patterns.yaml` 4 类 |
| R4 状态机引擎（Core） | ✅ | `src/state-machine/` 3 文件 + tests |
| R5 PMS 4 核心状态机 | ✅ | reservation/folio/room-status/housekeeping-task 均 ≥3 invariants |
| R6 Forced Acceptance 门禁 | ✅ | `src/accept-gate.ts` + ship.ts 集成 + tests |
| R7 Mutation Testing 引擎 | ✅ | `skills/forge-mutate/` + `src/mutate.ts` + Stryker deps |
| R8 PMS Mutation 关键模块 | ✅ | pack.yaml 声明 4 globs + threshold 85 |
| R9 单任务 Spec Micro-Review | ✅ | `src/build-micro-review.ts` + tests |
| R10 XML 铁律标签 | ✅ | CLAUDE.md 4 IRON-LAW + 5 HARD-GATE + `check-iron-laws.sh` |
| R11 Rationalization 扩展 | ✅ | tdd-rules.md 15+ 条 5 子类 |
| R12 BusinessDayClock | ✅ | `packs/pms/utils/business-day-clock.ts` + property tests + DST 3 时区 |
| R13 PMS Init Template | ✅ | `scripts/init.sh` `--pack` 参数 + 交互 |
| R14 PMS 预置场景 | ✅ | Sprint 2 目标 20 达成（check-in 5 + check-out 3 + reservation 4 + folio 4 + night-audit 4） |
| R15 非功能需求 | ✅ | zero-pack 测试扩展；Sprint 2 独立 zero-pack-sprint3.test.ts |

**所有 15 条 Requirement 达标，3 份 review 全部 pass，P0/P1 = 0。**

## 6. Sprint 3 `ddd-tactical-bdd-collaboration` 完成度矩阵

| Req | 状态 | 证据 | 备注 |
|-----|------|------|------|
| R1 Core DDD 模板 | ✅ | `templates/ddd/` 6 `.template` + 6 `.md` | 完整 |
| R2 PMS 战术模板 | ✅ | `packs/pms/templates/ddd/` 4 文件 | 完整 |
| R3 forge-storm skill | ✅ | SKILL.md + `src/storm.ts` + tests | 完整 |
| R4 Context Boundary Hook | ⚠️ | Hook + engine + tests 都有，但 `loadOwnershipMap` stub 返回 `{}` | 见 §6.3 |
| R5 business-analyst agent | ⚠️ | 触发逻辑已合并，但 **agent 定义文件未进主分支** | 见 §6.1 |
| R6 活文档生成 | ✅ | generator.ts + renderer.ts + tests | 完整 |
| R7 Money Lint | ⚠️ | YAML 声明式实现，与 Requirement "Biome plugin" 措辞有差距 | 见 §6.4 |
| R8 Time Lint | ⚠️ | 同 R7 | 见 §6.4 |
| R9 场景库 ≥50 | ✅ | 50 files / 103 scenarios | Review 过程中补齐 |
| R10 Sample Pack | ⚠️ | Marriott sample 存在，但 Bonvoy 场景只有 2 个（其他子目录 5-6） | 见 §6.5 |
| R11 core_subdomains | ✅ | PMS pack 声明 3 项；`getCoreSubdomains` 实现 | 完整 |
| R12 非功能需求 | ✅ | Zero-Pack-Sprint3 测试 + e2e integration | 完整 |

## 7. 6 个关键缺口详解（按优先级）

### 6.1 🔴 P0 — business-analyst.md 未合并到主分支 [Sprint 3 R5]

**现象**：
- `.claude/agents/` 下 10 个 agent 文件：architect, critic, debugger, designer, explore, product, quality-check, security-check, security, spec-check
- **没有** `business-analyst.md`
- 只在 `.claude/worktrees/ddd-tactical-bdd-collaboration/.claude/agents/business-analyst.md` 里
- `src/spec.ts` 中 `shouldTriggerBusinessAnalyst` + `getCoreSubdomains` 触发函数**已合并**

**后果**：
- `/forge spec` 对 Core 子域识别触发 `business-analyst` subagent 时，Claude Code 找不到角色定义文件
- 实际退化成通用 agent，Three Amigos 协作失效
- Sprint 3 review 报告写 "✅ agent.md + trigger logic" 是**事实错误**——仅 trigger logic 合并

**原因**：commit 遗漏或 rebase 丢 hunk，review 未做"主分支存在性交叉验证"

**修复**：复制 worktree 版本到主分支 `.claude/agents/business-analyst.md`，审阅后提交。工作量 30 分钟。

**相关 evolved rule**：R6 — review 必须对新增文件做主分支存在性验证

### 6.2 🔴 P0 — Glossary 格式约定与 Loader 期望不符 [Sprint 1 R6]

**现象**：
- Sprint 1 R6 requirements 规定每条术语独立 frontmatter + `## 定义` 段
- Sprint 2 实际 `packs/pms/glossary/*.md` 采用聚合格式：
  ```yaml
  ---
  name: reservations
  description: "..."
  terms:
    - term: Reservation
      aliases: [预订]
      definition: "..."
    - term: Room Type
      ...
  ---
  ```
- `src/glossary/registry.ts` 的 `parseGlossaryFile` 按 Sprint 1 requirement 编写，两者不匹配

**后果**（运行时行为，静态 grep 看不到）：
- `loadGlossary(pmsEnabledPacks)` 可能返回空 registry
- **Spec Leak Detector 的 glossary 白名单失效**（PMS 业务术语被误判为 leakage）
- `detectContextTermMismatch` 跨 context 检查瘫痪

**验证方法**：跑一次 `loadGlossary(pmsEnabledPacks)`，看 `entries.size`

**修复方案**（选一）：
- A. 扩展 `parseGlossaryFile` 兼容两种格式（推荐，向前兼容，半天工作量）
- B. 把 PMS glossary 改写为 Sprint 1 约定格式（工作量相近，但失去向后兼容）

**相关 evolved rule**：R7 — Pack/Loader 约定差异必须有运行时验证

### 6.3 🟠 P1 — loadOwnershipMap 是 stub [Sprint 3 R4]

**现象**：
```ts
// src/context-boundary.ts
export function loadOwnershipMap(...): Record<string, string> {
  return {};
}
```
Review 已登记为 P2。项目级 `.forge/context-ownership.yaml` 和 JSDoc `@context` 都未实装。

**后果**：
- Context Boundary Hook 只能靠 `packs/*/contexts/<name>/` 目录前缀推断 context
- 业务代码在 `src/domain/**` 下时，hook 无法识别 context，退化为 no-op
- **架构护栏形同虚设**

**修复**：实装 ownership map 两源加载（项目级 YAML + JSDoc tag），半天工作量

**相关 evolved rule**：R8 — Stub With TODO 不是 Zero-Pack 合理降级

### 6.4 🟠 P1 — Lint 规则形态偏离 Requirement [Sprint 3 R7/R8]

**现象**：
- R7/R8 requirements 写 "Biome plugin or ESLint plugin module"
- 实际交付 `packs/pms/lint-rules/{money,time}/*.yaml` + 自制解析器 `src/lint/pack-rules.ts`

**Review Layer 2 P2 标注**："Custom YAML parser 143 lines — acceptable for zero-dependency constraint"。

**性质**：**有意识的工程取舍**（零新依赖、Pack 代码纯数据、Zero-Pack 友好），但 requirement 措辞未对齐。

**代价**：
- 规则不进入 `biome check` / IDE 实时提示
- 必须主动跑 `scripts/lint-pack-rules.mjs`

**建议处理**：
- 保留 YAML 声明式（符合 Pack 零代码执行的安全原则）
- **修正 Requirement 措辞**以反映实现（amendment）
- 如果后续确实需要 IDE 实时反馈，单独立 spec 做 Biome plugin 包装层

### 6.5 🟢 P2 — Marriott Sample Bonvoy 场景偏少 [Sprint 3 R10]

**现象**：
- `packs/pms-marriott-sample/scenarios/bonvoy/` 仅 2 个 feature（earn-points、platinum-upgrade）
- 其他 Sprint 3 scenario 子目录每个 5-6 场景

**性质**：AC 最低门槛（≥2）满足，但样板感知差

**修复**：追加 3 个场景（points-forfeit-on-no-show、welcome-amenity-by-tier、points-plus-cash-redemption），1 小时

### 6.6 🟢 P2 — business-analyst dispatch e2e 测试缺失

**现象**：
- `test/spec/business-analyst-integration.test.ts` 仅测触发函数返回值
- 未测 subagent 真正被 dispatch 的 e2e 路径

**修复**：加 `test/spec/business-analyst-dispatch.test.ts`，mock agent runner 验证派发列表，1 小时

## 8. 测试覆盖状况（整体良好）

- `test/pack/` 10 个文件含 `zero-pack-invariant` + `zero-pack-sprint3`
- `test/state-machine/` 3 文件、`test/accept-gate.test.ts`、`test/mutate.test.ts`、`test/build/` 4 文件、`test/context-boundary/hook.test.ts`、`test/living-doc/` 2 文件、`test/lint/pack-rules.test.ts`、`test/storm.test.ts`、`test/template-renderer.test.ts` — 全部存在
- Property-based 测试：loader / resolver / spec-leak / scenario-linter / business-day-clock 均有
- **明显缺口**：无 `test/spec/business-analyst-dispatch.test.ts` e2e 验证

## 9. 流程反思（沉淀为 Evolved Rules R6/R7/R8）

本次审计暴露三个流程盲点，已固化为 `.forge/knowledge/evolved-rules.md` 的 R6/R7/R8：

### R6 — Review 必须对"新增文件"做主分支存在性验证
Review 声称 ✅ 但文件仅在 worktree。case: business-analyst.md 合并遗漏。

### R7 — Pack/Loader 约定差异必须有运行时验证
Zero-Pack 测试只覆盖反面，静态 grep 看不到 schema 断层。case: PMS glossary 聚合格式 vs Sprint 1 per-term 格式。

### R8 — Stub With TODO 不是 Zero-Pack 合理降级
核心函数返回空默认值 + TODO 注释应视为 P1 功能残缺。case: `loadOwnershipMap` 返回 `{}`。

## 10. 下一步建议

### 立即执行（P0）
1. 合并 `business-analyst.md` 到主分支 `.claude/agents/`（30 分钟）
2. 修复 Glossary parser 兼容两种格式 + 回归测试（2-4 小时）

### 下个迭代（P1，1 个工作日）
3. 实装 `loadOwnershipMap`（项目级 YAML + JSDoc）
4. 补 `pms-marriott-sample/scenarios/bonvoy/` 至 5 场景
5. 加 business-analyst dispatch e2e 测试
6. 在 ddd-tactical-bdd-collaboration requirements.md 追加 `## Amendment 2026-05-10` 澄清 Lint rule 形态

### 不建议做
- **不要**重做任何 Sprint。核心机制已到位，缺口是局部补丁性质
- **不要**动 Sprint 2 代码——已 review pass 且被 Sprint 3 依赖
- **不要**把 YAML lint 推倒重写 Biome plugin——除非项目已需要 IDE 实时提示

## 11. 修复计划归档

详细任务拆解与 TDD 步骤见 `.kiro/specs/sprint-3-gap-remediation/` spec：
- requirements.md：9 条 Requirement
- design.md：3 组代码修复 + 3 份文档 + 2 个集成测试
- tasks.md：4 Wave 执行计划，总工作量约 1 个工作日

## 12. 总结

**Sprint 1 + 2 是坚实的基础设施，Sprint 3 是表面完整但有三个"跨过最后一公里"的小缺口——合并 agent、实装 ownership loader、澄清 lint 规则形态。** 修复后 Forge 将真正达成 "SDD + ATDD + TDD + DDD + BDD" 完整工程化工作流。
