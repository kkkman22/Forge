---
status: archived
feature: workflows-integration
layout: tasks
created: 2026-05-25
spec_ref: ".forge/specs/workflows-integration/requirements.md"
archived_date: 2026-06-12
---

# Implementation Plan: workflows-integration

> **状态：partially-implemented (worktree-workflows-integration)**
> 14 个 Task 全部按"骨架可独立运行"标准完成；测试单元层 7166/7166 通过。
> 下列已勾选项表示骨架代码已落地；**剩余的"接入"和"运行时韧性"两类工作分别拆到**：
>
> - `workflows-integration-wiring`（待立 spec）：T4/T7/T9 的实际调用链接入
> - `workflows-integration-resilience`（待立 spec）：T5/T6/T11 中的背压/超时/429 降级
>
> 详见末尾 "## Out-of-Scope (deferred)" 章节。

## Overview

将 Claude Code 原生 Workflows 能力集成到 Forge 框架（工作包 A：分发层 + fallback），并将 forge-loop 驱动层从 agent-sdk 切换为 claude CLI 子进程（工作包 B：换芯）。共 14 个 Task，分 4 个 Phase 按依赖顺序执行。

## Tasks

- [x] 1. 插件打包路径迁移：将 `.claude/workflows/multi-agent-review.js` 迁移到插件根 `workflows/multi-agent-review.js`，在 `plugin.json` 新增 `"workflows": ["./workflows"]` 字段，删除旧路径，扩展 `test/plugin-manifest.test.ts` 新增 4 条 workflows 契约测试，在 `scripts/validate-plugin-manifest.mjs` 增加 workflows 校验逻辑
- [x] 2. 并发桥接 helper：创建 `workflows/lib/concurrency.js` 导出 `chunkedParallel(fns, opts)` 函数，从 env 读取并发上限（优先 `FORGE_MAX_PARALLEL_AGENTS_RUNTIME` → `FORGE_MAX_PARALLEL_AGENTS` → 6），改造 `multi-agent-review.js` 使用 `chunkedParallel` 替代直接 `parallel()` 调用，编写 `test/workflows/concurrency.test.ts`
- [x] 3. Fallback Ladder 规则文件：创建 `.claude/rules/workflow-fallback-ladder.md`（frontmatter `inclusion: always`），写入 L0–L3 四级表格、cross-reference ADR、HARD-GATE 声明，验证三个 SKILL 的 system prompt 能加载此文件
- [x] 4. WorkflowDispatcher 骨架：创建 `src/workflow-dispatcher.ts`，实现 `probeL0Eligibility`（5 步探测）、`dispatch`（L0 尝试 + L1 降级）、`writeDispatchRecord`（14 字段 JSONL）、`updateStatusMd`（3 字段）、`isolatePartialFindings`，编写覆盖 AC 2.1–2.10 的 unit-test 和 property-based-test
- [x] 5. StreamJsonAdapter：创建 `src/stream-json-adapter.ts`，实现行缓冲解析（64 MiB 单行上限）、事件分类路由（exposed/hidden/special）、partial message 合并（按 message.id 去重）、usage 累加（cost_usd 优先）、error 事件路由（抛 IterationFailedError）、unknown type 透传、EOF 截断保护、背压检测（16/4 MiB 水位），编写覆盖 AC 6.1–6.8 的测试
- [x] 6. CliSubprocessDriver：创建 `src/cli-subprocess-driver.ts` 实现 `AgentInterface`，包含 `buildArgs`（映射 permission/tools/mcp/dirs/system-prompt）、`buildEnv`（显式合并 process.env + ANTHROPIC_API_KEY + CLAUDE_CODE_* + FORGE_*）、`run`（spawn + stdin NDJSON + StreamJsonAdapter.consume）、stderr 捕获（追加 stderr.log + LogSink warn）、信号转发链（SIGINT→10s→SIGTERM→5s→SIGKILL + signal_chain.jsonl）、背压检测（4 MiB/5s → 60s → kill+retry）、session 接续（--resume vs --session-id 互斥），编写覆盖 AC 5.1–5.9 的测试
- [x] 7. IpcEmitter：创建 `src/ipc-emitter.ts`，实现版本握手帧（event=version, schema=N, supported_events=[...]）、通用 emit（补全 run_id/schema/ts → JSON → 截断 1024 字节 → stdout）、error/warning 帧格式化（fatal/retryable/code/message），编写覆盖 AC 8.1–8.7 的测试
- [x] 8. SdkDriver 改造：在 `forge-loop-cli.ts` 移除 `startup()` import，用 `CliSubprocessDriver` 替换 `agentRegistry.resolve('claude')`，标记 `sdk-agent-adapter.ts` deprecated，确认 6 个文件仅保留 `import type`，运行 `rg` 确认 0 个 runtime import
- [x] 9. WorkflowAuditWriter：创建 `src/workflow-audit-writer.ts`，实现 `resolveDestPath`（review/decide/learn 三路）、frozen-zone pre-check（路径匹配 + hook-check-frozen.sh）、mkdir-p、append-only 写入（旧内容 prefix 不变）、frozen_zone_blocked 标记，编写覆盖 AC 4.1–4.8 + property-based-test 的测试
- [x] 10. Warm-up 替代：在 `forge-loop-cli.ts` 主循环前插入 warm-up spawn（`claude --print --max-turns=1`），stdin 写入极短 prompt + end，30s 超时，exit 非 0 → 中止启动，记录 `warm-up.json`（不计入 --max-tokens），新增 `--no-warmup` flag，编写覆盖 AC 9.1–9.5 的测试
- [x] 11. 错误处理与降级：实现 stuck timeout（600s → SIGTERM → 30s → SIGKILL）、退出码分类重试（{1,2,137,143} → 指数退避 ≤ 3 次 → abort.json；其他 → 立即中止）、IPC warning 推送（subprocess-retry）、主循环退出 cleanup（PID/worktree/sleep-prevent + cleanup-errors.jsonl）、L0→L1 降级联动，编写覆盖 AC 10.1–10.6 的测试
- [x] 12. Desktop IPC 回归：换芯前录制 `ipc-baseline.ndjson`，创建 `scripts/diff-ipc-schema.mjs`（逐帧比对），创建 `apps/forge-loop-desktop/test/ipc-compat.test.ts`（record-replay），确认 `process_manager.rs` 对未知字段/event/超长行安全降级，编写 forward-compat 测试
- [x] 13. 市场分发回归：确认 `test/plugin-manifest.test.ts` 总用例 ≥ 13，创建 `test/plugin-marketplace-install.test.ts`（模拟安装 → 断言 workflow 被发现），CI `plugin-validate` job 加入测试，创建故意删除 workflows/ 的测试分支确认 CI fail，加入 cross-version 回归触发
- [x] 14. CLI flag 兼容性回归：录制 `--help` baseline，创建 snapshot 比对测试，为 21 个保留 flag 各写 unit-test，测试 `--unknown-flag` 拒绝，扫描 commander 确认新增 flag 有默认值

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Phase 1 — 分发层前置", "tasks": [1, 2, 3, 4] },
    { "name": "Phase 2 — 核心换芯", "tasks": [5, 6, 7, 8] },
    { "name": "Phase 3 — 集成与回归", "tasks": [9, 10, 11, 12, 13] },
    { "name": "Phase 4 — 最终验收", "tasks": [14] }
  ],
  "dependencies": {
    "2": [1],
    "3": [1],
    "4": [2],
    "6": [5],
    "8": [6, 7],
    "9": [4, 8],
    "10": [8],
    "11": [8],
    "12": [8],
    "13": [8],
    "14": [13]
  }
}
```

- **T1**（插件打包）是 T2（concurrency helper 放在 workflows/lib/）和 T3（规则文件）的前置
- **T2**（并发桥接）是 T4（dispatcher 需要并发探测）的前置
- **T5**（StreamJsonAdapter）是 T6（CliSubprocessDriver 依赖 adapter）的前置
- **T6** + **T7** 是 T8（SdkDriver 改造需要 driver + emitter）的前置
- **T8**（换芯完成）是 T9–T14 所有集成/回归任务的前置
- **T13**（市场分发回归）是 T14（CLI flag 回归，最终验收）的前置

## Notes

- 所有 Task 完成后运行 `npm run check`（= tsc + biome + vitest + check-readme-metrics）作为最终验证
- property-based-test 使用 `fast-check` 库，已在项目 devDependencies 中
- Phase 1 的 T1–T4 可以在不影响 forge-loop 的情况下独立合并（纯新增文件 + 测试）
- Phase 2 的 T5–T8 是破坏性变更，应在 feature 分支上完成后一次性合并
- Phase 3 的 T9–T13 依赖 T8 但彼此独立，可并行开发
- T14 是最终验收 gate，确认换芯后 CLI 字面兼容


---

## Out-of-Scope (deferred)

> 本节列出 partially-implemented 状态下 deferred 到后续 spec 的 AC 项。
> **共 41 项**未在本 worktree 落地，按"未做原因"分类如下：

### 类别 A — 集成接入（11 项 → 拆到 `workflows-integration-wiring`）

| AC | 内容 | 当前状态 |
|----|------|---------|
| R2.1 | 交互模式 + 5 前置条件全部为 true 时 dispatcher 通过 bp() 走 L0 | dispatcher 单测通过；调用方未接入 |
| R2.5 | dispatch.jsonl 14 字段每次自动追加 | 写入函数已实现，8 字段需自动注入 |
| R2.6 | 所有 fallback 失败时写 reviews + status.md + 阻断 ship | dispatcher 返回 chosenLevel='L3'；缺写入 |
| R2.8 | partial finding 隔离 + L1 frontmatter 含 precursor_partial | isolatePartialFindings ✅；L1 frontmatter 注入未做 |
| R3.4 | 三个 SKILL 渲染后 system prompt 含 fallback ladder 规则 | 文件 inclusion: always；缺集成测试 |
| R4.1–4.3 | review/decide/learn workflow 完成后写 .forge/ 三路 | AuditWriter 单测通过；调用方未接入 |
| R4.7 | 写入 Frozen_Zone 时联动 dispatch.jsonl frozen_zone_blocked: true | writer 抛 FrozenZoneViolation；缺与 dispatch.jsonl 联动 |
| R4.8 | hook-check-frozen.sh 校验 | 当前用 JS checker；shell hook 集成未做 |
| R5.7 | stderr 同步到 LogSink (level=warn) | 当前只 append 到文件 |
| R8.1 剩余 7 事件 | iteration_start/end/progress/message/tool_use/tool_result/completion 等 | IpcEmitter 已接入 5/12，剩余在 SdkDriver.emitEvent 桥接 |
| R12.2 | review L0 [3,1] 切批端到端测试 | chunkedParallel 单测通过；缺 dispatcher 接入后的 e2e |

### 类别 B — 缺少基础设施（2 项 → 拆到 `workflows-integration-resilience`）

| AC | 内容 |
|----|------|
| R8.8 | apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson 录制 + record-replay |
| R13.5 | CI 历史日志反扫近 100 次构建 0 个 `workflow load failed` |

### 类别 C — 复杂度超本次范围（11 项 → 拆到 `workflows-integration-resilience`）

| AC | 内容 |
|----|------|
| R10.1 | stuck timeout 600s + SIGTERM/30s/SIGKILL 链 + signal_chain.jsonl |
| R10.2 | retry 主循环：退出码 {1,2,137,143} 退避 60/120/240s + abort.json |
| R10.5 | 主循环 cleanup（PID/worktree/sleep-prevent + cleanup-errors.jsonl） |
| R10.6 | L0 子进程异常 → L1 降级联动（与 R2.4 配合） |
| R5.9 | stdout 缓冲 4 MiB / 5s 背压 + 60s 持续 → kill + retry |
| R6.7 | 行缓冲 64 MiB 单行上限 + 16/4 MiB 高低水位 + stdin pause/SIGSTOP |
| R12.5 | 429 降级链路（6→3→2→1）+ FORGE_MAX_PARALLEL_AGENTS_RUNTIME 注入 + tool-health.md |
| R12.7 | tool-health.md flock 并发安全 |
| 1000 次 property-based | R2.2 / R2.5 / R2.9 / R4.5 / R5.3 / R6.1 / R11.1 / R12.4 |

### 类别 D — 设计妥协（4 项，已明确接受）

| AC | 内容 | 妥协方案 |
|----|------|---------|
| R3.4 | inclusion: always 替代显式 SKILL @import | 接受 |
| R5.5 | sdk-agent-adapter.ts 保留 runtime import + 标 deprecated | spec design §7.2 显式允许 |
| R7.1 / R7.5 | 字符串 contain 替代 vitest snapshot | 后续 wiring spec 升级到 snapshot |
| R9.2 | warm-up args 字符串 contain 替代精确数组比对 | 后续 wiring spec 升级 |

### 类别 E — Pre-existing 不在范围（1 项）

| 项 | 内容 |
|----|------|
| docs/INDEX 等 29 个 first-line 错误 | 与 main 完全一致，由 docs-governance 工具链 bug 导致；另立 PR 修 |

---

## Implementation Status Summary

| Spec | Tasks | AC 覆盖 | 测试 |
|------|-------|---------|------|
| `workflows-integration` (本 spec, partially-implemented) | 14/14 ✅ 骨架 | 41/82 完整实现 + 41 deferred | 7166/7166 |
| `workflows-integration-wiring` (待立) | ~10 预计 | R2.1/R2.5/R2.6/R2.8/R3.4/R4.1–4.3/R4.7/R5.7/R8.1 剩余/R12.2 | 待立 |
| `workflows-integration-resilience` (待立) | ~12 预计 | R10.1/R10.2/R10.5/R10.6/R5.9/R6.7/R12.5/R12.7/R8.8/R13.5 + property-based | 待立 |
