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
