---
status: locked
contract_legacy: true
created: "2026-05-14"
topic: refactor-fix-into-build-mode
---

# Spec: refactor / fix 退化为 forge-build 的 nature mode

## 概述

将 `forge-refactor` 和 `forge-fix` 两个独立 skill 退化为 `forge-build` 的内部分支模式（refactor mode / bugfix mode），由 router 自动判定的 `work_nature` 字段驱动，无需用户传参。两个独立 SKILL.md 下线，方法库随 build 加载，预检查作为 nature-specific 的入口闸门。

## 动机

当前 `forge-refactor` 和 `forge-fix` 是 router 通过 `detectWorkNature()` 自动分流的独立 skill，但二者与 `forge-build` 在以下方面高度重叠：

- **基础设施**：commit 策略、branch gate、测试运行、状态推进、phase 更新机制
- **生命周期位置**：均替代主流程的 `plan → build` 段，下游同样接 `review → test → ship`
- **触发机制**：router 关键词自动判定，用户无需感知（`--nature` 仅作歧义逃生舱）

独立 skill 化造成：
- 三套相似的 commit/branch/test 调用逻辑
- 主包 skill 数量虚高（refactor + fix 各占 1 槽）
- SKILL.md 重复描述 build 通用能力
- 方法库始终常驻，即使任务为 feature 也加载

## 核心设计原则

- **零用户感知**：用户输入"优化排序逻辑"或"修复登录 bug"，仍由 router 自动分流，不需要任何 flag
- **自动化驱动**：`work_nature` 由 `detectWorkNature(description)` 关键词检测，已写入 `.forge/status.md`，build 启动时读取
- **方法库条件加载**：feature mode 不加载 refactor / bugfix 方法库，节省 token
- **预检查作为入口闸门**：每个 nature mode 启动第一步执行 nature-specific 预检查，不通过则结构化拒绝并回路由
- **逃生舱保留**：`--nature=refactor|bugfix|feature` 显式覆盖、`/forge refactor` / `/forge fix` 显式调用作为子命令仍可用（dispatch 到 build mode）
- **向后兼容**：现有 `forge-refactor` / `forge-fix` skill 进入 deprecated 期，至少 1 个版本周期保留

## 架构概览

### Router 输出（不变）

```ts
// src/router.ts
classifyTask(...) → ClassificationResult {
  tier: "light" | "standard" | "full",
  work_nature: "feature" | "refactor" | "bugfix",  // 关键字段
  taskType, projectPhase, hints, ...
}
```

### Sequence 映射（保持现有）

| work_nature × tier | sequence_key | 命令序列 |
|--------------------|--------------|---------|
| feature × light | `light` | build → review |
| feature × standard | `standard` | plan → build → review → test → ship |
| refactor × light | `refactor_light` | build(refactor) → review |
| refactor × standard/full | `refactor_standard` | plan → build(refactor) → review → test |
| bugfix × light | `fix_light` | build(bugfix) → review |
| bugfix × standard/full | `fix_standard` | plan → build(bugfix) → review → test |

`build(refactor)` / `build(bugfix)` 表示 build 内部按 nature 分支。

### Build 内部分支结构

```
forge-build 启动
  ↓
读取 .forge/status.md → 提取 work_nature
  ↓
按 work_nature 路由到对应 mode
  ├─ feature  → 走原有通用流程（plan 任务驱动）
  ├─ refactor → 加载 refactor 方法库 → 7 项前置检查 → scan → design → apply
  └─ bugfix   → 加载 bugfix 方法库 → 5 步分析 → analyze → apply → verify
  ↓
共用：commit、branch gate、测试运行、phase 更新、状态推进
  ↓
推进到 review
```

## Refactor Mode 行为

### 预检查（7 项闸门，命中即拒绝）

| # | 检查项 | 命中处理 |
|---|--------|---------|
| 1 | 行为改动夹带 | 路由器重判为 feature 或 bugfix |
| 2 | 目标无测试覆盖 | 先补测试（建议 `/forge build` 加测试任务） |
| 3 | 跨模块（≥ 3 个独立模块） | 先 `/forge spec` 设计 |
| 4 | 纯样式化 | 配置 lint/formatter 规则 |
| 5 | 生成产物 / 第三方代码 | 修源头（generator config / upstream） |
| 6 | 改动文件 > 15 | 缩小范围，分批 |
| 7 | scan 后无可重构项 | "零输出有效"，结构化退出 |

### 流程

| 阶段 | tier=light | tier=standard/full |
|------|------------|--------------------|
| 预检查 | ✅ 7 项 | ✅ 7 项 |
| Scan | 跳过 | scan → `.forge/findings/refactor-scan.md` |
| Design | 跳过 | design → `.forge/plans/refactor-<topic>.md` |
| Apply | 直接执行 | 逐步执行，每步验证行为等价 |
| Commit 策略 | scan 不 commit；apply commit | 同左 |

### 方法库

四层分类（L1 行为等价迁移 / L2 Fowler 经典 / L3 结构拆分 / L4 性能），仅在 nature=refactor 时加载到 build 上下文。

## Bugfix Mode 行为

### 预检查（与 refactor 不同的入口约束）

| # | 检查项 | 命中处理 |
|---|--------|---------|
| 1 | 非 review 产出的问题 | 改用 `/forge debug` |
| 2 | 需架构变更 | 改用 `/forge debug` 触发 ADR |
| 3 | 描述不足以定位（无错误信息、无复现步骤） | 提示补充信息，回路由 |

### 流程

| 阶段 | tier=light | tier=standard/full |
|------|------------|--------------------|
| 预检查 | ✅ | ✅ |
| Analyze | 跳过 | 5 步分析 → `.forge/findings/fix-analysis.md` |
| Apply | 直接执行 | 按方案定点修复（只改 analyze 声明的文件） |
| Verify | 复现验证 + 全量测试 | 同左 |
| 日志调试升级 | 最多 2 轮 | 最多 2 轮，仍失败则回 analyze |
| Commit 策略 | analyze 不 commit；apply commit | 同左 |
| 产出 | `.forge/findings/fix-note.md` | 同左 |

### 5 步分析

1. **Locate**：Grep/Glob 定位 file:line
2. **Reproduce**：正常 vs 失败路径分叉
3. **Confirm**：根因六分类（逻辑 / 状态 / 数据 / 并发 / 配置 / 缺防御）
4. **Assess**：影响面评估
5. **Propose**：2-3 修复方案 + 推荐

### 方法库

根因六分类 + 日志升级模板，仅在 nature=bugfix 时加载到 build 上下文。

## 用户路径示例

### 路径 1：自动判定（最常见）

```
用户: /forge 优化排序模块性能
  ↓
router: detectWorkNature → "refactor"
        status.md 写入 work_nature: refactor
  ↓
build 启动 → 读取 work_nature → refactor mode
  ↓
预检查 7 项 → 通过
  ↓
scan → design → apply → 推进 review
```

### 路径 2：显式覆盖（歧义时）

```
用户: /forge 重写支付模块支持新协议 --nature=feature
  ↓
router: 接受 user override → work_nature: feature
  ↓
build 启动 → feature mode（通用流程，不进 refactor 路径）
```

### 路径 3：显式子命令（向后兼容）

```
用户: /forge refactor
  ↓
forge.md dispatch → 透传 work_nature=refactor 到 build
  ↓
build (refactor mode)
```

## 文件影响

### 修改

- `src/router.ts` — 维持现有 `detectWorkNature` / `getWorkNatureSequenceKey`，无需变更（已就绪）
- `src/sdk-skill-iteration.ts` / `src/context-accumulator.ts` — 已支持 `work_nature` 透传，无需变更
- `skills/forge-build/SKILL.md` — 新增 §X "Nature Mode 路由" 节，包含 feature / refactor / bugfix 三分支
- `skills/forge-build/references/refactor-mode.md` — 新增（迁移自 forge-refactor）
- `skills/forge-build/references/bugfix-mode.md` — 新增（迁移自 forge-fix）
- `skills/forge-build/references/refactor-method-library.md` — 新增（条件加载）
- `skills/forge-build/references/bugfix-method-library.md` — 新增（条件加载）
- `.claude/commands/forge.md` — `refactor` / `fix` 子命令保留，dispatch 改为透传到 forge-build with `work_nature` preset
- `commands/forge-refactor.md` / `commands/forge-fix.md` — 改为透传 dispatcher（不再调用独立 skill）
- `docs/reference-commands.md` / `docs/reference-advanced.md` — 命令清单更新说明

### 新增

- `test/build-nature-mode.test.ts` — build 按 work_nature 分流的契约测试
- `test/build-refactor-precheck.test.ts` — 7 项前置检查的契约测试
- `test/build-bugfix-precheck.test.ts` — bugfix 预检查的契约测试
- `test/build-nature-mode.property.test.ts` — PBT：nature × tier × 描述 的分流一致性

### 删除（deprecation 期满后）

- `skills/forge-refactor/` — 整个目录
- `skills/forge-fix/` — 整个目录
- `commands/forge-refactor.md` / `commands/forge-fix.md` 中的内联指令体（仅保留透传 stub）

### 不变

- `skills/forge-fix-conflicts/` — 独立辅助命令，不在本 spec 范围
- `skills/forge-debug/` — 独立诊断命令，不并入

## 边界与约束

- **路由判定阶段不变**：router 仍是 `detectWorkNature` 单点入口，本 spec 不引入新检测逻辑
- **预检查必须在 build 内部第一步执行**：保证拒绝路径仍能回到路由器（emit 结构化 reject）
- **方法库条件加载**：`forge-build` SKILL.md 主体不放方法库内容；通过 reference 链接，AI 仅在 nature ≠ feature 时按需读取
- **共享基础设施零侵入**：commit、branch gate、测试运行的现有逻辑不为 nature mode 改动，nature mode 通过钩子接入
- **三态验证（VERIFIED / NOT_VERIFIED / INCONCLUSIVE）覆盖所有 nature**：refactor 行为等价 / bugfix 复现验证 / feature 任务完成都共享同一三态机制
- **deprecation 周期 ≥ 1 个版本**：旧 `forge-refactor` / `forge-fix` skill 在 deprecation 期内仍正常工作，启动时 emit notice：`⚠️ /forge refactor 已退化为 /forge build 的 refactor mode，下个版本移除独立 skill`

## 向后兼容性

| 入口 | v2.6（迁移期） | v2.7（移除期） |
|------|----------------|----------------|
| `/forge 重构 X` | router → build (refactor mode) | 同左 |
| `/forge refactor` | dispatch → build (refactor mode) | 同左 |
| `/forge fix` | dispatch → build (bugfix mode) | 同左 |
| `/forge --nature=refactor X` | dispatch → build (refactor mode) | 同左 |
| 直接调用 `Skill(forge-refactor)` | deprecated notice，仍执行 | Unknown skill |
| 直接调用 `Skill(forge-fix)` | 同上 | 同上 |

## 验收标准

1. 输入 "优化排序模块性能" → router 判定 refactor → build 启动 refactor mode → 执行 7 项预检查 → scan → design → apply
2. 输入 "登录页面报错" → router 判定 bugfix → build 启动 bugfix mode → 执行 bugfix 预检查 → analyze → apply → verify
3. 输入 "添加分页功能" → router 判定 feature → build 走原有通用流程，不加载 refactor / bugfix 方法库
4. `/forge refactor` / `/forge fix` 显式子命令仍工作，dispatch 到 build 对应 mode
5. `--nature=feature` 覆盖 router 自动判定时，build 不进 refactor 分支
6. refactor mode 第 1 项预检查（行为改动夹带）命中时，结构化拒绝并提示路由
7. bugfix mode 日志调试升级 2 轮失败 → 自动回 analyze 阶段
8. tier=light 跳过 scan/analyze，直接 apply（refactor / bugfix 均如此）
9. feature mode 不读取 refactor / bugfix references，token 消耗对比基线无回归
10. 旧 `forge-refactor` / `forge-fix` skill 在 deprecation 期内仍可被 dispatch 入口调用
11. 删除独立 skill 后，主包 skill 计数减少 2，仍在 SST 18-22 目标范围内
12. 三态验证机制对 refactor mode（行为等价）和 bugfix mode（复现 + 全量测试）正常工作

## 与现有路线图的关系

替代 ROADMAP v2.6 中"`forge-refactor` + `forge-fix` + `forge-fix-conflicts` 整合评估"的部分内容：

- **本 spec 覆盖**：refactor + fix 退化为 build mode
- **不覆盖**：fix-conflicts（保持独立辅助命令，git 冲突场景特化）

实施完成后 ROADMAP v2.6 该项可标记为 ✅，使用率数据收集仅需评估 fix-conflicts 是否独立保留（结论倾向于保留）。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| build SKILL.md 体积膨胀 | AI 加载成本 | references 拆分 + 条件加载，主体保持精简 |
| 关键词检测误判（feature 被误判为 refactor） | 流程错误分支 | 用户用 `--nature=feature` 覆盖；router 关键词集已有保守判定（refactor + bugfix 同时命中 → feature） |
| 预检查逻辑遗漏 | refactor / fix 质量回退 | 契约测试覆盖所有预检查项；与现有 forge-refactor / forge-fix 测试套件对齐 |
| 用户依赖独立 skill 的肌肉记忆 | 习惯改变 | dispatcher 入口完整保留，肌肉记忆零成本迁移 |
| deprecation 期间双路径维护 | 短期工作量 | 旧 skill 内部改为 stub，转发到 build，逻辑只在 build 维护 |

## 实施顺序建议

1. **预备**：build 内部接入 `work_nature` 读取 + mode 路由空骨架（feature 走原路径）
2. **Refactor Mode**：迁移 7 项预检查 + scan/design/apply 流程 + 方法库
3. **Refactor 测试**：契约测试 + PBT
4. **Bugfix Mode**：迁移 5 步分析 + analyze/apply/verify 流程 + 日志升级 + 方法库
5. **Bugfix 测试**：契约测试 + PBT
6. **入口对齐**：dispatcher 改为透传，旧 skill 进入 deprecated stub
7. **文档**：commands/docs 更新，emit deprecation notice 机制
8. **观察期**：1 个版本周期，监控误判率和用户反馈
9. **最终移除**：v2.7 删除独立 skill 目录
