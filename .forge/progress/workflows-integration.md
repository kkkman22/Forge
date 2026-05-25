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
