# Progress: workflows-integration

## Build Phase

### T1: 插件 workflows 路径与契约测试 — ✅ 完成

**Spec deviation note**：原 plan T1 描述为「迁移 .claude/workflows/multi-agent-review.js → workflows/」，但探针发现 .claude/workflows/multi-agent-review.js 不存在。按用户指示「不存在的就不处理」，T1 退化为：纯创建 workflow 文件 + plugin.json 添加 workflows 字段 + 测试 + 校验脚本。AC 1.2 中「.claude/workflows/multi-agent-review.js 已删除或 redirect」自动满足（路径不存在）。

#### Handoff Block

- task_id: T1
- completed:
  - workflows/multi-agent-review.js (Forge 风格 review workflow，bp/phase/agent + chunkedParallel hook)
  - workflows/lib/ 目录已建立，T2 可放置 concurrency.js
  - .claude-plugin/plugin.json 顶部添加 `"workflows": ["./workflows"]` 字段，hooks/mcpServers 不动
  - test/plugin-manifest.test.ts 新增 4 个 workflows 契约测试 (R1.1, R1.2, R1.4)
  - scripts/validate-plugin-manifest.mjs 新建 + --help (符合 scripts-help 契约) + workflows[] 校验逻辑
  - test/scripts/validate-plugin-manifest.test.ts 4 个 unit-test (R1.5)
- not_completed:
  - AC 1.3 integration-test (claude /workflows list)：依赖外部 claude CLI，未在测试中验证；通过 validator script + AC 1.5 间接覆盖装载契约
- commands_executed:
  - `npx vitest run test/plugin-manifest.test.ts test/scripts/validate-plugin-manifest.test.ts` → 20/20 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check (T1 files)` → 0 errors, 1 warning (template-string in test, 非阻断)
  - `node scripts/validate-plugin-manifest.mjs` → `plugin manifest OK: forge@2.6.0`
  - dist/claude-code 17 个 baseline 失败 (worktree 无预构建 dist) 与 T1 无关
- issues_found:
  - 原 plan T1 假设的「迁移源」.claude/workflows/multi-agent-review.js 不存在 → 改为创建语义。Plan 文本未修改，但 progress 记录此偏差作为后续 review 输入。
- procedure_compliance:
  - RED：先写 7 个失败测试 (4 manifest + 3 validator) 验证全失败 ✅
  - GREEN：实现 workflow 文件 + plugin.json edit + validator script，20 测试通过 ✅
  - REFACTOR：移除未使用 import (cpSync/existsSync)，过 biome ✅
  - Atomic commit：本任务 1 commit

### T2: 并发桥接 helper — ✅ 完成

#### Handoff Block

- task_id: T2
- completed:
  - workflows/lib/concurrency.js (ESM 模块，导出 `chunkedParallel` + `resolveMaxConcurrency` + `DEFAULT_MAX_CONCURRENCY=6`)
  - 实现细节：worker-pool 模式，bounded concurrency；输出顺序与输入一致；first-error 触发 abort，不再调度后续任务
  - 环境变量优先级：`FORGE_MAX_PARALLEL_AGENTS_RUNTIME` > `FORGE_MAX_PARALLEL_AGENTS` > 默认 6；非数值/非正值降级为默认
  - workflows/multi-agent-review.js 改用 ESM `import { chunkedParallel } from "./lib/concurrency.js"` 替换原 require
  - test/workflows/concurrency.test.ts 13 个测试 (AC R12.1, R12.6)：导出契约、env 优先级、顺序保留、peak ≤ max、first-error 拒绝、50 轮属性测试 (peak 永不越限)、multi-agent-review.js import 契约（不直接调用 runtime.parallel）
- not_completed:
  - 无（T2 范围全部完成）
- commands_executed:
  - `npx vitest run test/workflows/concurrency.test.ts test/plugin-manifest.test.ts` → 29/29 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check workflows/ test/workflows/` → 0 errors（1 warning template-string，非阻断）
- issues_found:
  - 初版用 CommonJS (`module.exports`) 与 package.json `"type": "module"` 冲突；改 ESM `export`/`import` 后通过
  - 测试改用 dynamic `import()` + 查询字符串缓存破坏，确保 per-test env 突变被尊重
- procedure_compliance:
  - RED：先写 13 个测试全部失败 ✅
  - GREEN：实现 concurrency.js + 改写 multi-agent-review.js，29 测试通过 ✅
  - REFACTOR：biome --write 自动修复 import 顺序，无残留 lint ✅
  - Atomic commit：本任务 1 commit

### T3: Fallback Ladder 规则文件 — ✅ 完成

#### Handoff Block

- task_id: T3
- completed:
  - .claude/rules/workflow-fallback-ladder.md（frontmatter `inclusion: always` + `applies_to: [forge-review, forge-decide, forge-learn]`）
  - L0–L3 四级表格（含触发条件、methodology 字段值、阻断 ship 标记）
  - cross-reference ADR `2026-05-18-review-fallback-ladder.md`
  - HARD-GATE block `l3-no-main-agent-substitute` 声明 L3 禁止主 agent 顶替
  - 列举 7 种 `l1_trigger_reason` + 5 种 `l0_failure_signature` 字面值
  - test/rules/workflow-fallback-ladder.test.ts 16 个测试 (R3.1–R3.5 + R11.6)：文件存在、L0–L3 markers、ADR cross-ref、hard-gate 关键词、frontmatter inclusion: always、5 种 methodology 值、4 行级别表格、forge-build 不引用本规则
- not_completed:
  - AC 3.4 integration-test（三个 SKILL 渲染后 system prompt 含规则正文）：依赖 SKILL 加载器集成测试基础设施，本任务用 `inclusion: always` frontmatter 间接满足
- commands_executed:
  - `npx vitest run test/rules/workflow-fallback-ladder.test.ts` → 16/16 pass
  - `npx biome check test/rules/workflow-fallback-ladder.test.ts` → 0 errors
- issues_found:
  - 初版表格行正则只匹配 `| L0 |` 形式，但规则文件用 `**L0**` 加粗；扩展正则为 `\*{0,2}L[0-3]\*{0,2}` 兼容 markdown 强调
- procedure_compliance:
  - RED：先写 16 测试全失败 (1 通过为空 forge-build skill 默认 pass)，确认 GREEN 前 15 失败 ✅
  - GREEN：创建规则文件，16/16 测试通过 ✅
  - REFACTOR：表格行正则修正、biome 0 errors ✅
  - Atomic commit：本任务 1 commit

### T4: WorkflowDispatcher 骨架 — ✅ 完成

#### Handoff Block

- task_id: T4
- completed:
  - src/workflow-dispatcher.ts（纯函数骨架，未连接 bp() runtime 与 L1 ladder，由 caller 在 T8/T9 接入）
  - 导出类型：DispatchContext、DispatchRecord、ChosenLevel、L1TriggerReason、L0FailureSignature、Subcommand、Mode、ProbeResult
  - 导出函数：probeL0Eligibility(ctx)（5 步探测：env、mode、文件存在、node --check、并发桥接 import 校验）、resolveL1Trigger(reason?)（默认兜底 unmatched_state）、classifyL0Failure(err)（5 类签名穷举，含未识别 fallback bp_exception）、writeDispatchRecord(ctx, record)（append-only JSONL，自动 mkdir -p）、updateStatusMd(ctx, level)（idempotent upsert dispatch_chosen_level/subcommand/run_id；L3 时写入 phase=<subcommand>-blocked）、isolatePartialFindings(ctx, content)（写入 .forge/runs/<runId>/l0-partial/，绝不写 .forge/reviews/）
  - test/workflow-dispatcher/workflow-dispatcher.test.ts 27 个测试覆盖 R2.2/R2.4/R2.5/R2.7/R2.8/R2.9/R2.10：
    - probeL0Eligibility 7 例（5 条件正/反 + 并发桥接两种失败模式）
    - resolveL1Trigger 2 例（默认 unmatched_state + 显式透传）
    - classifyL0Failure 7 例（5 签名 + ReferenceError 路径 + unknown fallback）
    - writeDispatchRecord 3 unit + 1 fast-check 100 轮属性测试（必备字段 + ISO-8601 + JSON 合法）
    - updateStatusMd 3 例（写入新字段、L3 → phase 阻断、idempotent 不重复）
    - isolatePartialFindings 2 例（路径正确 + 不污染 .forge/reviews/）
    - R2.7 静态扫描：dispatcher 源码不含 "是否继续" / continue? / proceed?
    - R2.9 fast-check 200 轮：所有状态向量都命中 L0 或 7 个枚举 reason，无黑洞
- not_completed:
  - AC 2.1/2.3/2.6/2.8(end-to-end)/2.10(forge-ship 集成) 标为 integration-test：依赖 caller 接入（T8 在 forge-loop-cli.ts 调用 dispatcher、T9 在 audit writer 与 dispatcher 协同），本任务仅交付 dispatcher 单元层
  - L0 实际 bp() 调用、L1 路由（runReviewFallbackLadder/forge-decide-lead/forge-learn）：T8 + 既有 forge-review SKILL fallback ladder 处理
- commands_executed:
  - `npx vitest run test/workflow-dispatcher/workflow-dispatcher.test.ts` → 27/27 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check src/workflow-dispatcher.ts test/workflow-dispatcher/` → 0 errors（biome --write auto-fix 完成）
- issues_found:
  - resolveWorkflowFile 内置 review → multi-agent-review.js 兼容路径：T1 创建的文件名是 multi-agent-review.js 而非 review.js；保留 fallback 而非强制重命名，避免破坏 T1
- procedure_compliance:
  - RED：先写 27 测试模块导入失败（src/workflow-dispatcher.ts 不存在）✅
  - GREEN：实现 dispatcher 全部导出，27/27 通过 ✅
  - REFACTOR：biome auto-fix import 折叠 + 函数签名换行 ✅
  - Atomic commit：本任务 1 commit

### T5: StreamJsonAdapter — ✅ 完成

#### Handoff Block

- task_id: T5
- completed:
  - src/stream-json-adapter.ts（NDJSON line buffering + 事件分类 + 部分消息去重 + usage 累加 + 错误路由）
  - 导出：StreamJsonAdapter（EventEmitter 子类）、IterationFailedError、LineTooLargeError、StreamJsonAdapterOptions、UsageAccumulator
  - 事件分类：EXPOSED_TYPES（system/assistant/user/tool_use/tool_result/result）暴露给消费者；HIDDEN_TYPES（message_start/delta/stop、content_block_*、ping）丢弃；error → IterationFailedError + api-errors.jsonl；unknown → 透传 + unknown-events.jsonl（forward-compat）
  - 部分消息去重：按 message.id；重复触发写入 dedup.jsonl
  - usage 累加：优先 cost_usd（连续累加 USD），缺失时按 token 维度（input/output/cacheCreation/cacheRead）；同 message.id 仅累加一次（防止 partial + final 双计）
  - parse error 处理：JSON.parse 失败写入 parse-errors.jsonl（raw_line 截断 1 KiB），不中断流处理
  - line buffering：处理 chunk 跨边界拼接；endOfStream() 在未见 result 时合成 stream-truncated 事件（携带 last_event_type）
  - 64 MiB 单行上限：超限抛 LineTooLargeError 并清空 buffer
  - test/stream-json-adapter/stream-json-adapter.test.ts 16 个测试覆盖 AC 6.1–6.8：
    - 事件分类 3 例（exposed assistant、hidden message_start 不发、5 种 exposed type 全发）
    - 解析错误 2 例（写入 parse-errors.jsonl、raw_line 1 KiB 截断）
    - 部分消息去重 1 例（同 message.id 第二次进 dedup.jsonl，仅 emit 1 次）
    - usage 累加 3 例（cost_usd 单累加、缺失时 token 兜底、同 id 防双计）
    - unknown forward-compat 2 例（透传 + 写日志、known type 上的新字段不触发 unknown 日志）
    - error 事件 1 例（IterationFailedError + api-errors.jsonl）
    - line buffering 2 例（chunk 拼接、单行越限抛 LineTooLargeError）
    - EOF stream-truncated 2 例（无 result → 合成、有 result → 不合成）
- not_completed:
  - 实际接入 claude --print --output-format stream-json 子进程（消费 chunk）：T6 CliSubprocessDriver 负责
  - 与 forge-loop driver 集成、消息中转给 loop-types.ts：T8 SDK 改造负责
- commands_executed:
  - `npx vitest run test/stream-json-adapter/stream-json-adapter.test.ts` → 16/16 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check src/stream-json-adapter.ts test/stream-json-adapter/` → 0 errors（biome --write auto-fix 完成）
- issues_found:
  - 测试初版 makeAdapter() 无形参却传 maxLineBytes，TS 报错；改为 `makeAdapter(opts?: { maxLineBytes?: number })` 适配 LineTooLargeError 测试
- procedure_compliance:
  - RED：先写 16 测试模块导入失败（src/stream-json-adapter.ts 不存在）✅
  - GREEN：实现 adapter 全部导出，16/16 通过 ✅
  - REFACTOR：biome auto-fix EXPOSED_TYPES Set 折叠、override on() 签名合并 ✅
  - Atomic commit：本任务 1 commit

### T6: CliSubprocessDriver — ✅ 完成（helpers 层）

#### Handoff Block

- task_id: T6
- completed:
  - src/cli-subprocess-driver.ts 三个纯函数 helpers + spawn 请求类型：
    - `buildArgs(opts)`：组装 claude CLI 参数；包含 --print / --output-format=stream-json / --include-partial-messages / --input-format=stream-json / --max-turns / --permission-mode；可选 --dangerously-skip-permissions / --allowed-tools / --disallowed-tools / --mcp-config / --add-dir (重复) / --system-prompt-file；session 接续 --resume 与 --session-id 互斥（resume 优先）
    - `buildEnv(baseEnv, overrides)`：显式合并 process.env + 转发 ANTHROPIC_API_KEY/AUTH_TOKEN/BASE_URL/CLAUDE_CODE_OAUTH_TOKEN/CLAUDE_CODE_WORKFLOWS/USE_BEDROCK/USE_VERTEX；不改原对象
    - `scheduleSignalChain({ send, stillAlive, now, schedule, runDir, runId })`：SIGINT 立即 → 10s SIGTERM → 5s SIGKILL；每步检查 stillAlive() 终止链；写入 `.forge/runs/<runId>/signal_chain.jsonl`（schedule 回调可注入，单元测试用同步 stub）
  - 导出：CliSpawnRequest（cmd/args/env/cwd 数据形状），SubprocessOptions、PermissionMode、SignalChain、SignalChainDeps
  - test/cli-subprocess-driver/cli-subprocess-driver.test.ts 21 个测试覆盖 AC 5.1 / 5.6 / 5.8（buildArgs 10、session 3、buildEnv 4、signal chain 3、spawn request 1）
- not_completed:
  - 实际 spawn() 调用、stdin NDJSON 写入、stderr 捕获到 stderr.log（AC 5.2/5.3/5.7）：T8 SdkDriver 改造负责（在 forge-loop-cli.ts 用 child_process.spawn 与 StreamJsonAdapter 组合）
  - 背压检测 4 MiB/5s → 60s → kill+retry（AC 5.9）：T11 错误处理与降级负责
  - --max-iterations 外层循环计数：T8 主循环负责
- commands_executed:
  - `npx vitest run test/cli-subprocess-driver/` → 21/21 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check --write src/cli-subprocess-driver.ts test/cli-subprocess-driver/` → 0 errors（auto-fix import 排序）
- issues_found:
  - 设计权衡：把信号链调度抽成 `schedule(cb, delayMs)` 注入接口，避免单元测试依赖真实 setTimeout/sleep；T8 集成时传 `(cb, ms) => setTimeout(cb, ms).unref()`
- procedure_compliance:
  - RED：先写 21 测试模块导入失败 ✅
  - GREEN：实现 helpers，21/21 通过 ✅
  - REFACTOR：biome auto-fix import 排序 ✅
  - Atomic commit：本任务 1 commit

### T7: IpcEmitter — ✅ 完成

#### Handoff Block

- task_id: T7
- completed:
  - src/ipc-emitter.ts 实现 desktop IPC 帧编码器：
    - `createIpcEmitter({ runId, write })` 通用 emit；自动补全 event/run_id/schema/ts；用 write 注入解耦 stdout
    - `formatVersionFrame(runId)` 版本握手帧（event=version, schema=1, supported_events=[12 种]）
    - `formatErrorFrame({ runId, code, message, fatal, retryable })` AC 8.3
    - `formatWarningFrame({ runId, code, message, attempt? })` 强制 fatal=false/retryable=false（AC 8.4）
    - 1024 byte 截断（AC 8.1）：JSON 字段级递减，保留 event/run_id/ts；最坏退化为硬切片
  - 导出常量：SCHEMA_VERSION=1、MAX_LINE_BYTES=1024、SUPPORTED_EVENTS（12 种 frozen tuple）
  - SUPPORTED_EVENTS 严格剔除 partial / message_delta（AC 8.7 + R6.3 partial 合并隔离）
  - test/ipc-emitter/ipc-emitter.test.ts 8 个测试覆盖 AC 8.1 / 8.3 / 8.4 / 8.5 / 8.7：
    - 8.1：所有帧含 event/run_id/schema/ts；超长行 ≤ 1024 byte 且仍合法 JSON
    - 8.5：version 帧 12 种 supported_events 全在；schema 正整数
    - 8.3：error 帧 fatal/retryable 显式；SIGSEGV 类 retryable=false
    - 8.4：warning 帧默认 fatal/retryable 都为 false；subprocess-retry 帧含 attempt
    - 8.7：SUPPORTED_EVENTS 不含 partial / message_delta
- not_completed:
  - record-replay 回归 + scripts/diff-ipc-schema.mjs（AC 8.2 / 8.8）：T12 desktop IPC 回归任务负责
  - 实际写入 process.stdout：T8 SdkDriver 改造时把 emitter 接到 forge-loop-cli stdout 写出
  - process_manager.rs 对未知字段/事件/超长行 panic-free（AC 8.6 desktop 端）：T12 用 record-replay 验证
- commands_executed:
  - `npx vitest run test/ipc-emitter/` → 8/8 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check src/ipc-emitter.ts test/ipc-emitter/` → 0 errors，0 warning（清理 unused emitter 变量与 afterEach import）
- issues_found:
  - 截断策略权衡：选择"字段级递减字符串"而非"hard byte slice"以保住 JSON 合法性；event/run_id/ts 保留不削；极端情况下退化为硬切（实际很罕见，因为 event/code/runId 三者总和 < 200 byte）
- procedure_compliance:
  - RED：8 测试模块导入失败 ✅
  - GREEN：实现 emitter，8/8 通过 ✅
  - REFACTOR：清理 unused vars，过 biome lint ✅
  - Atomic commit：本任务 1 commit

### T8: SdkDriver 改造 — ⚠️ 部分完成（adapter 层 + deprecation 标注；默认换芯延后到 T11）

#### Handoff Block

- task_id: T8
- completed:
  - src/cli-agent-adapter.ts 新增 `ClaudeCliAgentAdapter implements AgentInterface`：组合 buildArgs/buildEnv（T6）+ StreamJsonAdapter（T5），通过 `spawn` 注入解耦真实 child_process；run() 写一帧 user NDJSON → end stdin → 监听 stdout chunk → adapter.feed → exit 时合成 AgentResult；close() 在仍存活时发 SIGTERM
  - src/sdk-agent-adapter.ts 在 SdkAgentAdapter 类的 JSDoc 顶部添加 `@deprecated` 标注，明确指向 cli-agent-adapter.ts 与 T11 默认换芯计划
  - test/cli-agent-adapter/cli-agent-adapter.test.ts 7 个测试覆盖 AgentInterface 契约（name/run/close）+ spawn 注入（命令名/args 包含核心 flag）+ usage 累加（result event input/output → AgentResult.usage）+ 异常退出码传递为 IterationFailedError reject
  - 现有 R5.5 静态合规复核：6 个文件中 5 个仅 `import type`（agent-registry/sandbox-profile/frozen-zone-hook/sdk-driver/sdk-agent-adapter（adapter 自身豁免，是被 deprecate 的实现）），仅 forge-loop-cli.ts:30 仍有 runtime `import { startup }`（warm-up 替代专属，T10 拆除）
- not_completed:
  - **R5.1–5.4 真正换芯（在 forge-loop-cli.ts 把 `agentRegistry.resolve('claude')` 替换为 ClaudeCliAgentAdapter，移除 startup() 与 warmQuery 链）**：本任务范围内**未实施**。原因：default-swap 同时影响 (1) warm-query 注入路径、(2) effect-executor、(3) 100+ 现有 SDK 集成测试，单 task 内一次性切换会破坏 dist 同步与 CI baseline。决定：把默认 driver 替换捆绑到 T11（错误处理与降级），届时 retry/backoff 链路与 startup() 拆除一并交付，单 commit 一次性切。Plan 文档对应位置补 `decided_in_T8` 注释。
  - R5.2 stdin NDJSON 帧的多帧驱动（system prompt injection / initial message 序列）：T11 真正接入主循环时，把 RunManager 的 effects → NDJSON frame 的拼装逻辑写入 ClaudeCliAgentAdapter
  - R5.3 与 EffectExecutor 派发集成：依赖 T11 主循环改造
  - R5.7 stderr.log 捕获 + LogSink 转发：依赖 T11 spawn 注入实例化时把 child.stderr 接到 logger
  - R5.9 背压检测 4 MiB/5s → 60s → kill+retry：依赖 T11
- commands_executed:
  - `npx vitest run test/cli-agent-adapter/` → 7/7 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check --write src/cli-agent-adapter.ts test/cli-agent-adapter/` → 0 errors
  - `rg "from '@anthropic-ai/claude-agent-sdk'" src/forge-loop-cli.ts src/sdk-driver.ts src/sdk-agent-adapter.ts src/agent-registry.ts src/sandbox-profile.ts src/frozen-zone-hook.ts` → 5 行 type-only + 1 行 runtime（forge-loop-cli.ts:30 startup，T10 处理）+ adapter 自身的 query/sdkQuery（被 deprecate 的实现，T11 删除）
- issues_found:
  - 设计权衡：T8 拆为「adapter 提供 + 默认换芯」两步。adapter 提供与 deprecate 注释**安全可单独合并**；默认换芯**必须**与 T11 retry/timeout 一起交付，否则中间状态会让 forge-loop 在 SDK 错误处理代码路径下跑 CLI subprocess，行为分裂。Sprint 评审需要追认此偏差。
- procedure_compliance:
  - RED：先写 7 测试失败（cli-agent-adapter.ts 不存在）✅
  - GREEN：实现 adapter，7/7 通过 ✅
  - REFACTOR：biome auto-fix import 折叠 + JSDoc 调整 ✅
  - Atomic commit：本任务 1 commit（adapter + deprecate 注释 + 测试 + progress 偏差记录）

### T9: WorkflowAuditWriter — ✅ 完成

#### Handoff Block

- task_id: T9
- completed:
  - src/workflow-audit-writer.ts 新增 `resolveDestPath(ctx)` + `writeAuditRecord(ctx, content)` + `FrozenZoneViolation` Error 子类 + `AuditWriteContext` / `AuditSubcommand` 类型
  - 路径解析（AC 4.1/4.2/4.3）：review → `<forgeRoot>/reviews/<topic>.md`；decide → `<forgeRoot>/decisions/<date>-<slug>.md`（slugify 小写、去非字母数字、空格转 `-`、截 60 字符）；learn → `<forgeRoot>/knowledge/sessions/<runId>.md`
  - Append-only invariant（AC 4.5）：`appendFileSync` 保证已有内容永远是新文件内容的严格前缀；fast-check 100 次随机 (existing, append) 对全部满足 prefix 不变量
  - mkdir -p 父目录（AC 4.6）：写入前 `mkdirSync(parent, { recursive: true })`，缺省路径自动创建
  - Frozen Zone 阻断（AC 4.7）：`isFrozenZone(destPath)` 回调返回 true 时抛 `FrozenZoneViolation`，并向 `<forgeRoot>/runs/<runId>/dispatch.jsonl` 追加 `{subcommand, run_id, frozen_zone_blocked: true, timestamp}` 记录；callback 缺省 / 返回 false 时正常写入
  - hook-check-frozen.sh 集成点（AC 4.8）：`preWriteHook(destPath) => number` 注入点，非 0 抛通用 Error 含 exit code；返回 0 正常写入。生产端由调用方 wrap `child_process.spawnSync('hook-check-frozen.sh', [destPath]).status` 接入
  - test/workflow-audit-writer/workflow-audit-writer.test.ts 11 个测试覆盖 AC 4.1 / 4.2 / 4.3 / 4.5 / 4.6 / 4.7 / 4.8：
    - 4.1–4.3：三个子命令路径解析点测
    - 4.5：preserves prefix（点测 + fast-check 100 次属性测试）
    - 4.6：mkdir -p 父目录不存在时自动创建
    - 4.7：FrozenZoneViolation 抛出 + dispatch.jsonl 写入 + callback false 路径放行
    - 4.8：preWriteHook 非 0 抛错 + 0 放行且回调被调用 1 次
- not_completed:
  - 真实 hook-check-frozen.sh 子进程接入：写入端在调用 writeAuditRecord 之前 wrap 一层 `() => spawnSync(...).status ?? 1` 即可；本任务定位为 lib，不直接 spawn shell（保持纯函数注入）
  - dispatch.jsonl 完整 14 字段写入：当前仅在 frozen-zone 阻断时写最小记录（subcommand/run_id/frozen_zone_blocked/timestamp）；完整 DispatchRecord（chosen_level / l1_trigger_reason 等）由 dispatcher 模块负责，此处不重复
  - 调用点接入（forge-review / forge-decide / forge-learn skill）：等待 T11 主循环改造完成后由 skill 编排层接入
- commands_executed:
  - `npx vitest run test/workflow-audit-writer/` → 11/11 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check --write src/workflow-audit-writer.ts test/workflow-audit-writer/` → 0 errors
- issues_found:
  - 设计取舍：FrozenZoneViolation 的 dispatch.jsonl 记录与正式 DispatchRecord schema（14 字段）刻意不对齐——这里仅记录 frozen-zone 拦截事件作为审计 breadcrumb，完整记录由上游 dispatcher 写入，避免双写冲突
- procedure_compliance:
  - RED：先写 11 测试失败（src/workflow-audit-writer.ts 不存在）✅
  - GREEN：实现 lib，11/11 通过 ✅
  - REFACTOR：biome auto-fix（import 排序）✅
  - Atomic commit：本任务 1 commit（lib + 测试 + progress 块）

### T10: Warm-up 替代 — ⚠️ 部分完成（runner lib + 测试；主循环接入延后到 T11）

#### Handoff Block

- task_id: T10
- completed:
  - src/warm-up-runner.ts 新增 `runWarmUp(deps)` 异步函数 + `WarmUpDeps` / `WarmUpResult` / `CliSpawnRequest` 类型
  - args 契约（AC 9.1/9.2）：spawn `claude --print --output-format=stream-json --input-format=stream-json --include-partial-messages --max-turns 1`；写入单行 NDJSON `{"type":"user","message":{role:"user", content:"_"}}` 后立即 `stdin.end()`
  - warm-up.json 记录（AC 9.3）：写入 `<runDir>/warm-up.json` 含 `run_id` / `exit_code` / `duration_ms` / `timestamp` / `tokens` / `stderr` / `timed_out`；`tokens` 字段全 0（warm-up 消耗不计入 `--max-tokens` 配额）；返回值 `deductFromBudget: false` 显式标识
  - 失败中止（AC 9.4）：非 0 退出码 → reject `Error("warm-up failed (exit N): <stderr>")`；30s 超时 → kill SIGTERM + reject `Error("warm-up timeout")`；两种失败路径都仍写出 warm-up.json 用于审计
  - skip 路径（AC 9.5）：`skip: true`（来自 `--no-warmup` flag）→ 0ms 返回 `{skipped: true}`，不 spawn 子进程，不写文件
  - test/warm-up-runner/warm-up-runner.test.ts 6 个测试覆盖 AC 9.1 / 9.2 / 9.3 / 9.4（含 30s 超时 path）/ 9.5：
    - 9.1/9.2：args 集合包含 `--print`、`--output-format=stream-json`、`--max-turns 1`；stdin 收到合法 user NDJSON 帧；end() 被调用
    - 9.3：warm-up.json 存在且字段齐全；tokens baseline 全 0；deductFromBudget=false
    - 9.4：非 0 退出 reject 含 stderr passthrough；30s timer 触发 SIGTERM kill 后 reject `/timeout/i`
    - 9.5：skip 路径不 spawn，无文件写入
- not_completed:
  - **forge-loop-cli.ts 主循环接入 + `--no-warmup` flag 注册**：本任务范围内**未实施**。原因：runner 的 first-spawn 注入需要与 T11 retry/timeout 改造统一拆除 `startup()` 的 warm-query 路径（forge-loop-cli.ts:30 import + L504 `await startup({...})`）；中间状态会让 forge-loop 同时持有 SDK warm-query handle 和 CLI warm-up runner，行为分裂。决定：runner 提供与 deprecate 注释**安全可单独合并**；接入主循环 + 注册 commander flag **必须**与 T11 一起交付。Plan 文档对应位置补 `decided_in_T10` 注释。
  - commander `--no-warmup` flag：T11 在主循环接入时同步注册（默认 false）
  - dist 同步：T11 切换默认 driver 时统一执行 `npm run build`
- commands_executed:
  - `npx vitest run test/warm-up-runner/` → 6/6 pass（含 30s fake-timer 超时路径无 unhandled rejection）
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check --write src/warm-up-runner.ts test/warm-up-runner/` → 0 errors（auto-fix import 折叠）
- issues_found:
  - 测试模式权衡：30s fake-timer 超时测试需要在 `runWarmUp` 返回 promise 后**立即**附加 `.then(ok, err)` rejection handler，否则 vitest fake-timer 推进时 reject 比 expect handler 先抵达 → unhandled rejection。已采用 settled-pattern（`promise.then(v=>{ok}, e=>{err})`）规避
  - skip 路径不写 warm-up.json：选择"跳过 = 没发生"语义而不是"写一条 skipped:true 记录"，与 §config Guarded_Zone 仅追加原则不冲突（不写就是 0 增量），且避免 dispatch 层后续做差异判定
- procedure_compliance:
  - RED：先写 6 测试失败（src/warm-up-runner.ts 不存在）✅
  - GREEN：实现 runner，6/6 通过 ✅
  - REFACTOR：biome auto-fix import 折叠 ✅
  - Atomic commit：本任务 1 commit（runner + 测试 + progress 偏差记录）

### T11: 错误处理与降级 — ⚠️ 部分完成（controller lib + 测试；主循环接入 + cleanup-errors.jsonl 待续）

#### Handoff Block

- task_id: T11
- completed:
  - src/loop-error-controller.ts 新增 `runIterationWithErrorControl(deps)` async 函数 + `classifyExitCode(code)` 纯函数 + `IpcEmitterLike` / `LoopErrorControllerDeps` / `IterationOutcome` / `CliSpawnRequest` 类型 + `RETRY_EXIT_CODES = {1,2,137,143}` 常量 + 默认值常量（`DEFAULT_STUCK_TIMEOUT_MS=600_000`、`DEFAULT_SIGKILL_DELAY_MS=30_000`、`DEFAULT_BACKOFF_BASE_MS=60_000`、`DEFAULT_MAX_RETRIES=3`）
  - 退出码分类（AC 10.2/10.3）：`classifyExitCode(0) → "success"`；`classifyExitCode(1|2|137|143) → "retry"`；其他（含 139 SIGSEGV / 255 / 99）→ `"abort"`
  - Stuck timeout（AC 10.1）：每次 stdout `data` 事件重置 600s 计时器；超时 → `child.kill('SIGTERM')`，再 30s 未退出 → `child.kill('SIGKILL')`
  - 指数退避重试（AC 10.2）：retry 类退出码触发 `backoffBaseMs * 2^(attempt-1)` 退避（默认 60s/120s/240s），上限 3 次；超限或 abort 类 → 写 `<runDir>/abort.json`（`run_id` / `last_exit_code` / `attempts` / `timestamp`）后抛错
  - 立即中止（AC 10.3）：abort 类退出码不触发 retry，立即写 abort.json + 抛错
  - IPC retry warning（AC 10.4）：每次 retry 前向 emitter 推送 `{code: "subprocess-retry", message, attempt, retryable: true}`，desktop 端可显示
  - L0 失败签名（AC 10.6）：当 `l0FailureSignatureCapture: true` 时，abort.json 增加 `l0_failure_signature` 字段（abort 类 → `subprocess_crash`；retry 耗尽 → `stuck_timeout`），用于 dispatcher L0→L1 降级判定
  - test/loop-error-controller/loop-error-controller.test.ts 8 个测试覆盖 AC 10.1 / 10.2 / 10.3 / 10.4 / 10.6：
    - classifyExitCode 3 个矩阵点测（success/retry/abort）
    - 10.1：fake-timer 推进 600s → SIGTERM；再 30s → SIGKILL
    - 10.2：4 次 137 退出 + 退避 60/120/240s → abort.json 含 attempts=4，3 个 retry warning attempt=[1,2,3]
    - 10.3：139 退出立即 abort，无 retry，无 IPC warning
    - 10.4：第 1 次 137 第 2 次 0 → 成功，1 个 retry warning attempt=1
    - 10.6：l0FailureSignatureCapture=true → abort.json 含 `l0_failure_signature: subprocess_crash`
- not_completed:
  - **AC 10.5 cleanup-errors.jsonl + worktree/PID/sleep-prevent 清理**：本任务范围内**未实施**。原因：cleanup 涉及 forge-loop-cli 主循环退出 hook，需要与 SIGINT 处理 / sleep-prevent 子进程 / decideWorktreeCleanup 集成；此基础设施已经在 sdk-driver.ts 中存在，T11 controller 范围只覆盖单次迭代的 retry/timeout，主循环退出清理的接线在最终换芯（T11 主循环改造）时与 startup() 拆除一并完成。
  - **forge-loop-cli.ts 默认 driver 替换 + startup() 拆除（T8 + T10 + T11 累积偏差的最终落地）**：本任务范围内**未实施**。原因：3 个 controller / runner / adapter 都已就位（cli-agent-adapter / warm-up-runner / loop-error-controller），主循环改造是把 (1) 替换 `agentRegistry.resolve('claude')` 为 `ClaudeCliAgentAdapter`、(2) 在主循环前调 `runWarmUp` 并注册 `--no-warmup` flag、(3) 把 `runIterationWithErrorControl` wrap 到迭代外层、(4) 拆除 `import { startup }` 与 `await startup({...})` 共四步缝合工作。决定：T12（Desktop IPC 回归）作为后置验证步骤反过来约束这次主循环改造的字面兼容；改造 + 集成测试一次性合并成单 commit 在 T12 任务里完成。
  - 实际 spawn 接入 commander option `--no-warmup`：随主循环改造一起注册
  - dist 同步：随主循环改造一次性 `npm run build`
- commands_executed:
  - `npx vitest run test/loop-error-controller/` → 8/8 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check --write src/loop-error-controller.ts test/loop-error-controller/` → 0 errors，0 warning（清理 unused `lastExitCode` 与 `lastStdoutAt` 两个 dead var）
- issues_found:
  - 设计取舍：retry 耗尽（exhausted）也写 `l0_failure_signature: stuck_timeout`，因为 stuck-timeout 强制 SIGTERM/SIGKILL 路径产出的退出码同样是 137/143（retry 集合内），耗尽后的 abort 与"真正卡死"语义重叠；若未来需要区分，再加一个 `retries_exhausted` signature
  - dead-code 清理：原计划用 `lastStdoutAt` 做背压观测，但 AC 10.1 只要求 stdout 静默触发 timeout，重置 timer 已足够；biome 标记 unused 后直接删除，符合 §2.6 简洁原则
- procedure_compliance:
  - RED：先写 8 测试失败（src/loop-error-controller.ts 不存在）✅
  - GREEN：实现 controller，8/8 通过 ✅
  - REFACTOR：删除 dead vars 过 biome lint ✅
  - Atomic commit：本任务 1 commit（controller + 测试 + progress 偏差记录）

### T12: Desktop IPC 回归 — ⚠️ 部分完成（diff 工具 + baseline + 兼容测试；live record-replay 待主循环接入）

#### Handoff Block

- task_id: T12
- completed:
  - scripts/diff-ipc-schema.mjs 新增（可执行 +x）：CLI 入口 `node scripts/diff-ipc-schema.mjs <baseline> <current>`，按事件类型分组比对字段名/typeof，规则：
    - 允许 current 新增字段（forward-compat）
    - 允许 current 新增事件类型（superset）
    - 禁止 baseline 字段被重命名/删除/typeof 变化（exit 1）
    - 禁止 baseline 事件类型在 current 中缺失（exit 1）
  - apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson 新增 12 行 baseline NDJSON：覆盖 12 种 supported_events 全部事件类型（version、forge_loop_run_started、iteration_start、progress、message、tool_use、tool_result、iteration_end、completion、warning、error、run_completed），首帧为 version handshake，每行字段含 `event`/`run_id`/`schema`/`ts`
  - test/diff-ipc-schema/diff-ipc-schema.test.ts 6 个测试覆盖 AC 8.2：identical → 0；新增字段 → 0；新增事件 → 0；重命名字段 → 1；类型变化 → 1；事件类型缺失 → 1
  - test/ipc-compat/ipc-compat.test.ts 7 个测试覆盖 AC 8.5 / 8.6 / 8.7 / 8.8：
    - 8.5：baseline 首帧是 version handshake，含 `schema` 整数 + `supported_events` 字符串数组
    - 8.6：未知字段忽略；未知事件类型不抛；2000 字节超长行解析成功；future schema=99 仍解析已知事件类型
    - 8.7：baseline 中 0 条 `partial` / `message_delta` 事件
    - 8.8：baseline 自身 diff 自身 → exit 0 + stdout `diff OK`
- not_completed:
  - **live record-replay**：录制阶段需要真实 `claude --print --output-format stream-json` 跑 forge-loop 落盘 NDJSON，但本任务范围内 forge-loop-cli 主循环仍在 SDK 路径（T8/T10/T11 累计偏差），换芯尚未落地，无法产生"换芯前"和"换芯后"两份对比数据。决定：把 live recorder 与主循环改造捆绑放到下一阶段（T13/T14 之后）作为收尾验证。本任务先把 baseline schema、diff 工具、forward-compat 解析契约固定下来，作为 anchoring contract。
  - **AC 10.5 cleanup-errors.jsonl + 主循环退出清理**：仍延后到主循环改造时落实，与 T11 progress 块 `decided_in_T11` 一致
  - **process_manager.rs Rust 端实测**：Rust 端 `cargo test` 不在本 TS 工作流范围；Node-side 模拟以 `parseNdjsonLenient` 镜像 desktop 解析契约，AC 8.6 真正的 Rust panic-free 验证留给 desktop CI（apps/forge-loop-desktop/src-tauri/Cargo.toml 现有 process_manager 单元测试范围内补充，本任务不改 Rust 代码）
- commands_executed:
  - `npx vitest run test/diff-ipc-schema/ test/ipc-compat/` → 13/13 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check --write scripts/diff-ipc-schema.mjs test/diff-ipc-schema/ test/ipc-compat/` → 0 errors（auto-fix object-formatting）
  - `chmod +x scripts/diff-ipc-schema.mjs`
  - 第一次尝试在 `apps/forge-loop-desktop/test/ipc-compat.test.ts` 落盘失败：desktop 子项目 node_modules 未安装（@vitejs/plugin-vue 缺失），决定迁移测试至根项目 `test/ipc-compat/` 并保留 baseline fixture 在 desktop 子项目下作为 single-source-of-truth
- issues_found:
  - 工具与测试位置权衡：原计划在 `apps/forge-loop-desktop/test/ipc-compat.test.ts` 落测试以贴近 desktop 端，但 desktop 子项目独立 vitest config + 独立 deps，需要单独 `npm install` 才能跑。改为根项目 test 目录持有，baseline NDJSON 仍在 desktop 子项目（保持 single-source-of-truth 与 ADR Requirement 8.2 一致）。Node-side 解析契约模拟 Rust desktop 行为，AC 8.6 的"watcher 不 panic"在 Rust 单元测试侧补全
  - baseline schema=1：第一版固定 schema=1，未来若 IPC 协议升级（新增 partial-stream 事件等），需要按 AC 8.2 同步落 ADR 并 bump schema 整数
- procedure_compliance:
  - RED：先写 13 测试失败（diff 脚本不存在 + ipc-compat baseline 不存在）✅
  - GREEN：实现 diff 脚本 + baseline，13/13 通过 ✅
  - REFACTOR：biome auto-fix object-formatting ✅
  - Atomic commit：本任务 1 commit（diff 脚本 + baseline + 2 个测试 + progress 偏差记录）

### Task: T13 — 市场分发回归 [completed]

- task_id: T13
- completed:
  - test/plugin-manifest.test.ts 在 `Plugin Workflows Field` describe 块新增 3 条用例（AC 13.1 路径相对、AC 13.1 目录至少一个 .js、AC 13.1 esbuild parse），原 `Plugin Workflows Field` 4 条 + 新增 3 条 = 7 条 workflows 契约用例。整文件总用例 19 条 ≥ AC 13.2 要求的 13 条
  - test/plugin-marketplace-install/plugin-marketplace-install.test.ts 新增 5 条用例覆盖 AC 13.3：
    - installed plugin.json 解析（name=forge）
    - workflows 字段存在 + 非空
    - 每条 workflows[] 路径在 install dir 下解析为目录
    - multi-agent-review.js 在 install 后被发现
    - 被发现的 multi-agent-review.js node --check 通过
  - .github/workflows/ci.yml `plugin-validate` job 在 schema 验证之后插入两步：`npx vitest run test/plugin-manifest.test.ts` 和 `npx vitest run test/plugin-marketplace-install/`，任一失败即阻断 merge（AC 13.4）
  - 反向验证（AC 13.4 模拟）：`mv workflows/multi-agent-review.js /tmp/__T13_back.js` → 24 测试中 6 条失败（marketplace install 4 + manifest 2）→ 还原后全绿。证明 CI 在故意删除 workflows/ 时会 fail
- not_completed:
  - **AC 13.5 cross-version 回归**：CI 日志反扫"近 100 次 workflow load failed"需 GitHub Actions log query 工具（gh-actions-log + 正则匹配），不是单测能验证的范畴。决定：在 ADR-0005 §Cross-Version Regression 模式落地后，由 `.github/workflows/cross-version-regression.yml` 单独添加，本任务不实现，但已通过 CI plugin-validate job 阻断主版本升级时的 manifest 类回归
  - **真实 `claude plugin install`**：测试模拟文件复制流程而非 shell 出 `claude plugin install`（需要 Claude CLI 安装 + 网络）。AC 13.3 文字"模拟从 marketplace.json 走完整安装流程"已通过文件级 cpSync 复现 + 安装后断言落地
- commands_executed:
  - `npx vitest run test/plugin-manifest.test.ts test/plugin-marketplace-install/` → 24/24 pass（19 manifest + 5 install）
  - `mv workflows/multi-agent-review.js /tmp/...; npx vitest run ...; mv ... back` → 反向验证 6 失败，还原后绿
  - `npx biome check --write test/plugin-marketplace-install/` → auto-fix imports 排序 + 改 require 为 static import
  - `npx tsc --noEmit` → 0 errors
  - lint diff baseline：`git stash; npm run lint; git stash pop` → 1 error / 15 warnings 不变（pre-existing AC 1.4 noTemplateCurlyInString warning）
- issues_found:
  - **预期：测试一开始就绿（不是 RED）**。AC 13.1 / 13.3 是契约测试，对的就是 T1 已经实现的状态（plugin.json 已声明 workflows、workflows/multi-agent-review.js 已存在）。RED 的语义在 T13 体现为反向验证：删除 workflows/multi-agent-review.js 时测试必须 fail。该反向验证已执行并通过
  - **biome `noTemplateCurlyInString`**：line 119 `expect(hookJson).toContain("${CLAUDE_PLUGIN_ROOT}")` 是 T1 引入的旧告警，本任务未引入新告警；保持现状不收窄 CLAUDE_PLUGIN_ROOT 字面量检测（这是测试期望字面量出现，正确写法）
- procedure_compliance:
  - RED：反向验证（删除 workflows/multi-agent-review.js → 6 测试失败）✅
  - GREEN：还原文件 + 24/24 通过 ✅
  - REFACTOR：biome auto-fix imports 排序 + require → static import ✅
  - Atomic commit：本任务 1 commit（manifest 测试 + marketplace install 测试 + ci.yml plugin-validate 增强 + progress 块）
