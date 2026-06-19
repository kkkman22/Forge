---
status: draft
feature: metrics-hook-wiring
layout: requirements
created: 2026-06-19
tier: light
work_nature: feature
---
# Requirements Document — 接线 metrics 采集 hook

## Introduction

Forge 的 ROADMAP.md:56-58 有多项"基于使用率决定是否合并/降级命令"的评估(grill/zoom-out 使用率、refactor/fix/fix-conflicts 合并评估),CHANGELOG.md:498 也记录 R14/R16 评估"pending 14-day metrics"已**超过一个月未解**。

代码调研发现根因:**metrics 采集脚手架已完整写好,但 hook 从未接线,导致从未采集过任何数据**。

代码证据(亲自验证):
- `scripts/metrics-recorder.mjs`(31 行)注释写明"Called by UserPromptSubmit hook"——但 `.claude-plugin/plugin.json`(`:1-36`)**没有 `hooks` 字段**。
- `scripts/aggregate-metrics.mjs`(66 行)聚合脚本也已存在。
- `.forge/.metrics/` 目录**不存在**(亲自 `ls` 验证)——证实从未运行过采集。
- 后果:ROADMAP 所有"基于使用率"的决策都是拍脑袋,无法推进。

这是一个**典型的"建了一半的脚手架"**——和 `context-injection-activation` spec 同类问题。本 spec 只做"接线",不新建采集逻辑。

## Goals

- 让 `metrics-recorder.mjs` 在每次用户 prompt 提交时被调用,采集使用率数据到 `.forge/.metrics/`。
- 解锁 ROADMAP 中所有 pending 的"基于使用率"评估。
- 零行为变更:metrics 采集对用户透明,不影响命令执行,不阻断任何流程。

## Non-Goals

- 不修改 `metrics-recorder.mjs` / `aggregate-metrics.mjs` 的逻辑——它们已写好,只缺触发。
- 不在本 spec 做"基于 metrics 自动合并命令"——那是后续决策,本 spec 只解锁数据。
- 不引入新的 metrics 维度(如 token 消耗、phase 耗时)——先让现有脚本跑起来。
- 不把 metrics 上报到外部服务——纯本地 `.forge/.metrics/`。
- 不为 metrics 采集编写复杂的失败重试——hook 失败应静默(不能因 metrics 挂掉阻断用户输入)。

## Requirements

### Requirement 1: plugin.json 注册 UserPromptSubmit hook

**User Story:** As a maintainer, I want the metrics-recorder script to actually be invoked, so that usage data accumulates for the pending evaluations。

#### Acceptance Criteria

1. THE `.claude-plugin/plugin.json` SHALL 新增 `hooks` 字段,注册 `UserPromptSubmit` 事件调用 `scripts/metrics-recorder.mjs`。
2. THE hook 注册 SHALL 使用 Claude Code 的 hook 配置格式(参考 `.githooks/` 或现有 `hooks/hooks.json` 的写法,确保字段名/matcher 正确)。
3. THE hook SHALL 以**非阻断**方式运行——metrics 采集失败不得影响用户 prompt 提交(exit code 失败时静默,或在脚本内 try/catch 兜底)。
4. THE hook 调用 SHALL 传入用户 prompt 内容(供 metrics-recorder 解析命令使用),但不采集 prompt 全文隐私——仅提取 `/forge <sub>` 的 sub 命令名。

### Requirement 2: .forge/.metrics/ 目录与数据落地

**User Story:** As a maintainer, I want metrics data to land in a known location, so that aggregate-metrics can read it。

#### Acceptance Criteria

1. THE `metrics-recorder.mjs` SHALL 将采集结果写入 `.forge/.metrics/`(目录不存在时自动创建)。
2. THE 数据文件命名/格式 SHALL 与 `aggregate-metrics.mjs` 的读取约定一致(查看 aggregate 脚本的输入路径假设,保持兼容)。
3. THE `.gitignore` SHALL 评估是否忽略 `.forge/.metrics/`(建议忽略,避免把个人使用数据提交;若团队需要聚合统计,在 design.md 决策)。

### Requirement 3: 幂等与性能

**User Story:** As a developer, I want the hook to be fast and not slow down my prompt submission。

#### Acceptance Criteria

1. THE `metrics-recorder.mjs` 的执行时间 SHALL < 100ms(纯本地文件追加,无网络)。
2. THE hook SHALL 在 `.forge/` 目录不存在(非 forge 项目)时静默跳过,不报错——避免污染非 forge 项目。
3. THE 采集 SHALL 使用 append-only 写入(对齐 `context-injection.ts` 的 O_APPEND 并发安全语义),避免并发 prompt 竞态。

## 验收标准

- [ ] `.claude-plugin/plugin.json` 含 `hooks.UserPromptSubmit` 注册
- [ ] 在 forge 项目中提交一次 `/forge status` 后,`.forge/.metrics/` 出现数据文件
- [ ] metrics-recorder 执行 < 100ms(手动计时或脚本内打点)
- [ ] 在非 forge 项目中提交 prompt 不报错(静默跳过验证)
- [ ] `aggregate-metrics.mjs` 能正确读取并输出聚合结果
- [ ] hook 失败时不阻断用户 prompt(模拟脚本错误,验证 prompt 仍提交)

## 依赖

- 无前置 spec 依赖。`metrics-recorder.mjs` / `aggregate-metrics.mjs` 已存在。
- 本 spec 是其他评估类决策的前置:完成后,ROADMAP 的 grill/zoom-out 使用率评估、refactor/fix 合并评估才有数据支撑。

## 非目标

- 不实现 metrics 的可视化 dashboard。
- 不实现 metrics 的自动清理/归档(超出本 spec 范围)。
- 不改变 forge-slimming 的 SST 目标值——metrics 只是提供决策依据,是否调整 SST 是后续独立决策。
