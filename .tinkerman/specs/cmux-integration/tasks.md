---
feature: cmux-integration
layout: tasks
created: 2026-05-08
spec_ref: ".tinkerman/specs/cmux-integration/requirements.md"
---

# Implementation Plan

按 Sprint 分批落地，每个任务都显式关联 Requirement AC 与 Design 章节。任务粒度控制在 0.5–1 个工作日。

TDD 铁律：每个含实现代码的任务都按 RED → GREEN → REFACTOR 执行，禁止先写实现再补测试。

本 spec 的 src/ 改动严格限制在 3 个文件（R11.10）：`src/sdk-driver.ts`、`src/check-frozen.ts`、`src/review.ts`。其他既有 src/ 模块**零改动**。

---

## Sprint 1 — 打地基：纯函数库 + 依赖 + i18n（≈ 2 天）

- [x] 1. mock-socket 测试基础设施
  - [x] 1.1 实现 `test/cmux-mirror/mock-socket.ts`
    - 监听临时路径 Unix socket，接收 cmux JSON-RPC newline-delimited 请求
    - 支持方法：`system.ping`、`system.capabilities`、`surface.send_text`、`notification.create`、`set_status`、`set_progress`、`log`、`sidebar_state`、`browser.identify`
    - 导出 `createMockSocket(opts): Promise<{ socketPath, requests, close }>`
    - 引用：[R11.8]，Design §8.2
  - [x] 1.2 准备 fixtures
    - `test/cmux-mirror/fixtures/capabilities-full.json`（全能力）
    - `test/cmux-mirror/fixtures/capabilities-partial.json`（缺 `set-progress`）
    - `test/cmux-mirror/fixtures/status-build.md`（phase=build 的 status.md）
    - `test/cmux-mirror/fixtures/progress-wave2.md`（wave 2 正在跑的 progress 文件）
    - `test/cmux-mirror/fixtures/review-in-progress.md`（layers_status 两 done 一 pending）
    - `test/cmux-mirror/fixtures/events-session.ndjson`（完整 Forge Loop 事件序列）
    - 引用：Design §3.1

- [x] 2. 添加 `yaml` npm 依赖
  - [x] 2.1 `npm install yaml --save --save-exact`
    - 版本锁定（安全纪律），当前最新稳定版
    - 验证：`package.json` 中 `yaml` 出现在 `dependencies` 且是精确版本号
    - 引用：[R15.3]，Design §2.1（"新依赖"行）
  - [x] 2.2 更新 `package.json` 中 `check-deps.mjs` 白名单（如有）
    - 运行 `node scripts/check-deps.mjs` 确认新依赖被允许
    - 引用：Forge 现有供应链纪律

- [x] 3. `lib/availability.mjs` — 可用性检测（TDD）
  - [x] 3.1 RED：`test/cmux-mirror/availability.property.test.ts`
    - fast-check 生成 `{CMUX_WORKSPACE_ID, CMUX_SOCKET_PATH, socketExists, socketIsSocket}` 组合
    - 断言 `cmuxAvailable()` 在固定输入下两次调用返回相同结果（idempotence）
    - 断言异常输入（stat 抛错、超时） → false 不传播异常
    - 引用：[R12.1, R1.2]
  - [x] 3.2 GREEN：实现 `scripts/cmux-mirror/lib/availability.mjs`
    - 导出 `cmuxAvailable()`、`markUnavailable(reason)`、`isStickyUnavailable()`、`__resetForTest()`
    - 按 Design §4.1 的核心签名实现
    - 引用：Design §4.1
  - [x] 3.3 集成测试 `test/cmux-mirror/sticky-unavailable.test.ts`
    - 验证首次 EPIPE 后 `cmuxAvailable()` 立即并持续返回 false（R13.9）
    - 验证 `CMUX_INTEGRATION=off` 短路（R1.7）
    - 引用：[R13.1, R13.9, R1.7]

- [x] 4. `lib/capabilities.mjs` — cmux 能力探测
  - [x] 4.1 RED：`test/cmux-mirror/capabilities.test.ts`
    - 用 mock-socket 模拟 `system.capabilities` 返回 full / partial / timeout 三种响应
    - 断言 `hasCapability('set-progress')` 正确返回 true/false
    - 断言 2 秒超时 → 空能力列表 + debug log
    - 引用：[R13.5]
  - [x] 4.2 GREEN：实现 `scripts/cmux-mirror/lib/capabilities.mjs`
    - 启动时调一次 `cmux capabilities --json` → 内存缓存
    - 超时 2 秒硬截断，失败不抛
    - 引用：Design §4.6

- [x] 5. `lib/payload.mjs` — 映射表（纯数据，TDD）
  - [x] 5.1 RED：`test/cmux-mirror/payload-mapping.property.test.ts`
    - fast-check 生成任意 `phase` 字符串（含域内和域外）
    - 断言 `phaseToIcon(phase) ∈ Object.values(PHASE_TO_ICON) ∪ {"circle"}`
    - 断言 `tierToColor(tier)` 对域内返回固定值，域外返回 `null`（emitter 会据此省略 `--color`）
    - 引用：[R12.3, R12.4]
  - [x] 5.2 GREEN：实现 `scripts/cmux-mirror/lib/payload.mjs`
    - 导出 `PHASE_TO_ICON`、`TIER_TO_COLOR`、`LOOP_STATE_TO_ICON`、`phaseToIcon()`、`tierToColor()`
    - 按 Design §3.5 映射表
    - 引用：Design §3.5

- [x] 6. `lib/budget.mjs` — 进程内通知预算（TDD）
  - [x] 6.1 RED：`test/cmux-mirror/budget-monotonic.property.test.ts`
    - fast-check 生成任意 consume 序列（含 no-op 跳过）
    - 断言可用预算单调非增
    - 断言 `cmux_notification_budget = 0` → 始终返回 "downgrade"
    - 引用：[R12.2, R7.3, R7.5]
  - [x] 6.2 GREEN：实现 `scripts/cmux-mirror/lib/budget.mjs`
    - 导出 `createBudget(initial)`、`.consume() → "ok" | "downgrade"`、`.reset(newLimit)`
    - 引用：Design §4.2, §5.2

- [x] 7. `lib/dedupe.mjs` — 文件系统 TTL 去重（TDD）
  - [x] 7.1 RED：`test/cmux-mirror/dedupe-idempotent.property.test.ts`
    - fast-check 生成 `{filePath, currentTs, windowMs}` 组合
    - 断言：同一 filePath 在 windowMs 内连续两次 `checkAndRecord` 返回 `{notify: true}` 然后 `{notify: false}`
    - 引用：[R12.8]
  - [x] 7.2 GREEN：实现 `scripts/cmux-mirror/lib/dedupe.mjs`
    - 导出 `checkAndRecord(filePath, dedupeDir, windowMs)` → `{ notify: boolean }`
    - SHA1 哈希文件名；tmp+rename 原子写
    - dedupe 目录创建失败 → 返回 `{notify: true}` 兜底（R13.11）
    - 引用：Design §3.2.4, §4.4

- [x] 8. `lib/cli.mjs` — cmux CLI 子进程封装
  - [x] 8.1 实现 `scripts/cmux-mirror/lib/cli.mjs`
    - 导出 `runCli(args, { timeoutMs }): Promise<{exitCode, stdout, stderr} | null>`
    - EPIPE/ECONNREFUSED/ENOENT → 调 `markUnavailable()` 并返回 null
    - stderr 含 "refused"/"broken pipe" → 同上
    - 引用：Design §4.6

- [x] 9. config 字段 + i18n key 同步
  - [x] 9.1 修改 `templates/config.md`
    - 注释模板新增 5 个 optional 字段：`cmux_integration`、`cmux_notification_budget`、`cmux_review_notify`、`cmux_session_idle_minutes`、`cmux_respawn_budget`
    - 每个字段附默认值与取值范围注释
    - 引用：[R11.9, R16.7, R13.12]，Design §3.3
  - [x] 9.2 补全 `locales/zh.json` + `locales/en.json`
    - 覆盖 notify title / subtitle / body / log message / progress label / cmux.json commands[].name、description（共约 22 条）
    - 技术标识符（source、key、icon name）不纳入 i18n
    - 引用：[R11.4]，Design §5.3
  - [x] 9.3 新增 `test/cmux-mirror/i18n-parity.test.ts`
    - 读 zh 与 en 的 key 集合，断言完全一致
    - 引用：[R11.4]

- [x] 10. Sprint 1 回归
  - [x] 10.1 运行 `npm run check` 全量通过（typecheck + lint + vitest）
    - 预期新增 4 个 property test 文件、约 5 个 unit test 文件
    - 引用：Design §8.1

---

## Sprint 2 — Events_NDJSON 与 Reviews Frontmatter（≈ 3 天）

- [x] 11. `lib/events.mjs` — Events_NDJSON 解析（TDD）
  - [x] 11.1 RED：`test/cmux-mirror/events-tolerance.property.test.ts`
    - fast-check 生成混合合法/损坏的 JSONL 文本，随机截断最后一行
    - 断言：所有合法行被解析；损坏行被跳过（不抛）；cursor 单调递增且不吃掉最后未完成的行
    - 断言：`schema_version > 1` 的事件被跳过（R14.9）
    - 引用：[R12.11, R14.6, R14.9]
  - [x] 11.2 GREEN：实现 `scripts/cmux-mirror/lib/events.mjs`
    - 导出 `readEventsSince(path, cursor) → {events, cursor}`
    - 最后一行无 `\n` 时不计入 cursor（等下次再读）
    - 引用：Design §4.7

- [x] 12. `src/sdk-driver.ts` — 追加 Events_NDJSON 写入（≤ 100 行）
  - [x] 12.1 RED：`test/cmux-mirror/sdk-driver-events.test.ts`
    - 跑一个简短的 mock 迭代序列（start → iter × 2 → rollback → terminated）
    - 断言 `.tinkerman/runs/<id>/events.ndjson` 包含正确的事件行
    - 断言 `schema_version`、`ts`、`type`、`run_id` 必填字段全部存在
    - 断言 `objective` / `subject` / `reason` 经 `redactSecrets` 脱敏（用含 `ghp_xxx` 的输入验证）
    - 引用：[R14.1, R14.2, R14.3, R14.8]
  - [x] 12.2 GREEN：修改 `src/sdk-driver.ts`
    - 新增私有方法 `writeEvent(type, payload)`，使用 `appendFileSync` + try/catch（不抛，仅 `logger.warn`）
    - 在 9 个切点调用：`session_started`、`iter_started`、`iter_committed`、`iter_rolled_back`、`circuit_breaker_tripped`、`loop_terminated`、`session_ended`、`session_interrupted`、错误通道
    - 按 Design §4.7 "写入侧"代码示例
    - 引用：[R14.1–R14.8]
  - [x] 12.3 验证 `npm run check` 通过；sdk-driver 既有测试（`test/sdk-driver.*.test.ts` 等）仍绿
    - 引用：§11.3 既有契约不变

- [x] 13. `lib/reviews.mjs` — Reviews frontmatter 读取（TDD）
  - [x] 13.1 RED：`test/cmux-mirror/reviews-parse.test.ts`
    - 用 fixture 文件测试：新格式（含 `layers_status`+`completed_at`）、旧格式（无这两字段）、损坏格式（frontmatter 缺失 / YAML 错）
    - 断言返回 `{ layers_status, completed_at, hasLegacyFormat }` 符合预期
    - 引用：[R15.7]
  - [x] 13.2 GREEN：实现 `scripts/cmux-mirror/lib/reviews.mjs`
    - 导出 `parseReviewFrontmatter(path)` 与 `isReviewComplete(fm)` 两个纯函数
    - 使用 `src/frontmatter.ts` 的 `parseFrontmatter`（已有）+ `yaml.parse`
    - 引用：Design §4.8

- [x] 14. `src/review.ts` — frontmatter 原子重写（≤ 80 行）
  - [x] 14.1 RED：`test/cmux-mirror/reviews-frontmatter-schema.test.ts`
    - 模拟一次完整的 review 流程：init → spec done → quality failed → security done
    - 断言每一步 `.tinkerman/reviews/<topic>.md` 的 frontmatter 字段正确
    - 断言 atomic rewrite 不损坏 body
    - 断言所有三个 terminal 后 `completed_at` 非 null 且为 ISO 8601
    - 引用：[R15, R15.5, R15.6, R15.8]
  - [x] 14.2 GREEN：修改 `src/review.ts`
    - 新增 `initReviewFrontmatter(topic)`、`markLayerStatus(topic, layer, status)`、内部辅助 `atomicUpdateFrontmatter(path, mutator)`
    - 使用 `yaml.stringify` / `yaml.parse`
    - 按 Design §4.8 "写入侧"示例
    - 在 `/forge review` 执行流里调用
    - 引用：[R15.1–R15.6]
  - [x] 14.3 验证既有 `/forge review` 输出 schema 不变
    - 引用：§11.1 forge-review 契约

---

## Sprint 3 — Mirror_Daemon 核心 + Push 通道（≈ 3 天）

- [x] 15. `lib/session.mjs` — Forge_Session 状态机（TDD）
  - [x] 15.1 RED：`test/cmux-mirror/session-totality.property.test.ts`
    - fast-check 生成任意 statusChange + event 序列
    - 断言状态 ∈ `{unknown, active, inactive}`
    - 断言 idle timeout（模拟 15 分钟）触发 active → inactive
    - 引用：[R12.12, R16.1–R16.8]
  - [x] 15.2 GREEN：实现 `scripts/cmux-mirror/lib/session.mjs`
    - 导出 `SessionTracker` class 按 Design §4.2.5
    - 钩子 `onBoundary(kind, workspaceRef)` 回调
    - 支持 `tickIdle()` 供外部定时器触发
    - 引用：Design §4.2.5, §6.1

- [x] 16. `lib/respawn.mjs` — Respawn_Budget 计数（TDD）
  - [x] 16.1 RED：`test/cmux-mirror/respawn-budget.test.ts`
    - 模拟 4 次 crash：前 3 次返回 `{ shouldRespawn: true, count, budget }`，第 4 次返回 `{ shouldRespawn: false, exhausted: true }`
    - 模拟 session-start 后重置 counter，再次允许 3 次 respawn
    - 断言 `.tinkerman/.cmux-respawn-count` 文件内容正确（原子读写）
    - 引用：[R13.12–R13.14]
  - [x] 16.2 GREEN：实现 `scripts/cmux-mirror/lib/respawn.mjs`
    - 导出 `tryConsumeRespawn(projectRoot, budget) → { shouldRespawn, count, budget, exhausted }`
    - 导出 `resetRespawnCount(projectRoot)`（由 Mirror_Daemon 在 session-start 调用）
    - 使用 tmp+rename 原子写
    - 引用：Design §2.1（`lib/respawn.mjs` 行）, §4.3

- [x] 17. `lib/reader.mjs` 与 `lib/emitter.mjs` — 状态读取与命令生成
  - [x] 17.1 实现 `scripts/cmux-mirror/lib/reader.mjs`
    - 导出 `readState({ projectRoot }) → CanonicalSidebarPayload`
    - 从 `.tinkerman/status.md` / `.tinkerman/progress/*.md` / `.tinkerman/reviews/*.md` / `.tinkerman/runs/*/events.ndjson` 合成 payload
    - 纯函数（可测），I/O 通过注入的 fs 层
    - 引用：[R2.1, R12.10]，Design §2.1
  - [x] 17.2 实现 `scripts/cmux-mirror/lib/emitter.mjs`
    - 导出 `buildCommands(payload, prevPayload, capabilities) → CmuxCommand[]`
    - 纯函数：输入 payload 变化，输出应发送的 CLI 命令序列
    - `set-progress` 使用 ratio 浮点（R3.2）；label 文本含 `<done>/<total>`
    - 缺 capability 的命令跳过
    - 引用：[R2.2, R3.2, R4.2, R13.5]，Design §2.1, §3.5
  - [x] 17.3 集成测试 `test/cmux-mirror/reader-emitter-roundtrip.test.ts`
    - 用 fixture 跑一次 reader → emitter，断言命令序列符合预期
    - 引用：[R2.2]

- [x] 18. `lib/push-server.mjs` + `push.sh` — Mirror_Push_Socket（TDD）
  - [x] 18.1 RED：`test/cmux-mirror/push-socket.test.ts`
    - 启动 mock push-server，发送各种 JSON 行：
      - 合法 `resync_now` / `phase_changed` / `layer_completed` → dispatcher 被调用
      - 未知 type → 跳过不调用 dispatcher
      - 错乱 JSON → 跳过不调用 dispatcher
      - 超过 20/s 的行 → 多余丢弃
      - `force_notify` 类型（白名单外） → 拒绝
    - 断言 socket 文件权限为 0600
    - 引用：[R17.1–R17.4, R17.8]
  - [x] 18.2 GREEN：实现 `scripts/cmux-mirror/lib/push-server.mjs`
    - 导出 `createPushServer({ socketPath, onEvent })` 按 Design §4.6a 代码
    - 启动时 unlink 旧 socket；chmod 0600
    - 引用：Design §4.6a
  - [x] 18.3 实现 `scripts/cmux-mirror/push.sh`
    - 按 Design §4.6a 的 bash 脚本
    - 需兼容无 `nc` 的环境（fallback 到 `python3`）
    - 没 cmux → exit 0（R17.10）；socket 不存在 → exit 0（R17.5）
    - 引用：[R17.5, R17.6, R17.10]
  - [x] 18.4 集成测试 `test/cmux-mirror/push-sh-integration.test.ts`
    - 脚本级别：socket 不存在时 exit 0；socket 存在时正确传 JSON
    - 引用：[R17.5, R17.6]

- [x] 19. `mirror.mjs` 主程序
  - [x] 19.1 实现 `scripts/cmux-mirror/mirror.mjs`
    - 启动流程按 Design §4.2.1 的 12 步
    - fs-type 检测：macOS `mount | grep <path>`、Linux `stat -f -c %T <path>` 判定文件系统
    - 自适应原生 fs.watch 或 chokidar polling（需要将 chokidar 作为 devDependency 还是 lazy require？决策：使用 `require('chokidar')` guarded import，若缺失则降级到 `fs.watch` + 手动 `setInterval` 轮询）
    - 整合：availability 检测 + 独占锁 + PID 文件 + capabilities 缓存 + session 初始化 + budget + fs-watch + push-server + 信号处理
    - 引用：Design §4.2, §5.8
  - [x] 19.2 集成测试 `test/cmux-mirror/mirror-startup.test.ts`
    - 覆盖 R1.5–R1.10、R2.10、R13.5 各种启动分支
    - cmux 不可用 → 立即 exit 0
    - 独占锁已被占 → exit 0
    - 引用：[R1.5, R1.7, R1.8, R1.9, R2.10, R13.5]
  - [x] 19.3 集成测试 `test/cmux-mirror/mirror-fs-watch.test.ts`
    - 用临时 `.tinkerman/` 目录 + mock-socket，验证：
      - 写 status.md phase 变更 → cmux set-status 调用
      - 写 progress/*.md 任务完成 → cmux set-progress 调用（ratio 正确）
      - 防抖 250ms 生效（连写 3 次只有最后一次被发）
    - 引用：[R2.1, R2.2, R3.1–R3.5]
  - [x] 19.4 集成测试 `test/cmux-mirror/mirror-polling-fallback.test.ts`
    - 强制 `MIRROR_USE_POLLING=1` 环境变量走 polling 路径
    - 验证事件仍被正确分发
    - 引用：Design §5.8, Risk #12
  - [x] 19.5 集成测试 `test/cmux-mirror/mirror-events-consume.test.ts`
    - 预置 `.tinkerman/runs/r-test/events.ndjson` 包含完整事件序列
    - 启动 mirror，断言 cmux set-status forge.loop / set-progress / log / notify 按正确顺序被调
    - 覆盖 circuit breaker notify 路径
    - 引用：[R4.1–R4.10, R14.6]
  - [x] 19.6 集成测试 `test/cmux-mirror/mirror-review-observe.test.ts`
    - 模拟 `.tinkerman/reviews/test.md` 三次 frontmatter 变更（逐层 done）
    - 断言 per-layer log 依次发出，final aggregate notify 发出一次（session 内 topic 去重）
    - 旧格式 reviews 文件（缺字段）→ 跳过聚合通知，仍能 body-diff 发 per-layer log
    - 引用：[R5.1–R5.7, R15.7]
  - [x] 19.7 集成测试 `test/cmux-mirror/mirror-session-boundary.test.ts`
    - 覆盖 session start/end/idle-timeout/event-triggered 四种边界转换
    - 断言 budget 在 session-start 时 reset
    - 断言 `.cmux-respawn-count` 被 reset（Mirror_Daemon 的职责，R13.14）
    - 引用：[R16, R7.1, R7.6]
  - [x] 19.8 集成测试 `test/cmux-mirror/mirror-push-socket.test.ts`
    - mirror 启动后，用 push.sh 发 `resync_now` → cmux set-status 被调
    - 发 `force_notify` → 被拒绝（白名单外）
    - 超过 20 events/s 速率 → 多余丢弃
    - 引用：[R17.1–R17.8]
  - [x] 19.9 集成测试 `test/cmux-mirror/tmux-passthrough.test.ts`
    - 模拟 `$TMUX` + `$CMUX_WORKSPACE_ID` 同时设置的环境
    - 断言 notification 路径走 OSC_777 Passthrough 包装
    - 引用：[R13.3, R13.4]

---

## Sprint 4 — Sync_Once / Hook 接入（≈ 2 天）

- [x] 20. `sync-once.mjs` 一次性同步
  - [x] 20.1 实现 `scripts/cmux-mirror/sync-once.mjs`
    - 按 Design §4.3 的 9 步流程
    - 含受限 respawn：调用 `lib/respawn.mjs` 的 `tryConsumeRespawn`
    - 持锁 1 秒 timeout；锁获取失败 → exit 0
    - 引用：[R2.7–R2.10, R13.12–R13.14]
  - [x] 20.2 集成测试 `test/cmux-mirror/sync-once.test.ts`
    - 覆盖分支：cmux 不可用 / 非 Forge 项目 / 锁被占 / mirror 存活 / mirror 挂掉但有预算 / mirror 挂掉预算耗尽
    - 引用：[R2.7–R2.10, R13.12, R13.14]

- [x] 21. `hook-notify.sh` 冻结拦截通知
  - [x] 21.1 实现 `scripts/cmux-mirror/hook-notify.sh`
    - 按 Design §4.4 的 bash 脚本
    - 使用 `shasum -a 1` 生成文件路径哈希
    - 所有 cmux 调用 `|| true` 降级
    - 验证 exit code 永远 0（不污染主 hook）
    - 引用：[R6.1–R6.7, R12.7]
  - [x] 21.2 集成测试 `test/cmux-mirror/hook-notify.test.ts`
    - 触发 3 次连续拦截：第 1 次发 notify + log，2/3 次只发 log（5s 窗口内）
    - 等待 6 秒后再次触发 → 重新发 notify
    - cmux 不在 PATH → 直接 exit 0 不报错
    - 引用：[R6.2, R6.3, R6.5]

- [x] 22. `src/check-frozen.ts` — 1 行尾部 exec（不改判定逻辑）
  - [x] 22.1 RED：`test/cmux-mirror/check-frozen-integration.test.ts`
    - 模拟冻结文件被写 → check-frozen 阻断；hook-notify 被调用
    - 模拟非冻结文件被写 → check-frozen 放行；hook-notify 不被调
    - 模拟 cmux 不在环境 → check-frozen 行为完全不变（exit code 与现有行为一致）
    - 引用：[R6.1, R12.7]
  - [x] 22.2 GREEN：修改 `src/check-frozen.ts`
    - 在阻断决策之后、exit 之前加 1 行 fire-and-forget `spawn('bash', ['scripts/cmux-mirror/hook-notify.sh', filePath, status])`
    - `.catch(() => {})` 吞掉任何异常
    - **不改**主判定逻辑与 exit code
    - 引用：[R6.1, R11.10.b]
  - [x] 22.3 验证 `npm run check` + 既有 `test/check-frozen.*.test.ts` 全绿
    - 引用：§11.3 既有契约

- [x] 23. `hooks/hooks.json` 追加 3 条非阻塞 hook
  - [x] 23.1 修改 `hooks/hooks.json`
    - UserPromptSubmit 追加一条：`node scripts/cmux-mirror/sync-once.mjs 2>/dev/null || node ~/.claude/skills/forge/scripts/cmux-mirror/sync-once.mjs 2>/dev/null || true` timeout 2s
    - PostToolUse (Write|Edit) 追加同样一条
    - Stop 追加同样一条
    - **既有 hook 条目不删不重排**
    - 引用：[R2.7]，Design §2.3
  - [x] 23.2 集成测试 `test/cmux-mirror/hooks-integration.test.ts`
    - 解析 `hooks/hooks.json`，断言包含 3 条 sync-once 相关 entry 且位置为追加
    - 断言既有 check-frozen hook 条目仍存在且顺序不变
    - 引用：[R2.7, §11.3]

---

## Sprint 5 — 模板 / 可选包 / Browser QA（≈ 2 天）

- [x] 24. `templates/cmux.json` — Forge 专属布局
  - [x] 24.1 创建 `templates/cmux.json`
    - 三种布局 `Forge Workflow` / `Forge Loop Monitor` / `Forge Dev`，每种含 15% 高度 Mirror_Pane
    - Mirror_Pane 命令：`node scripts/cmux-mirror/mirror.mjs`
    - `forge.newClaudeCode` action：`cmd+shift+c` / `claude --dangerously-skip-permissions` / `sparkles` icon
    - `ui.surfaceTabBar.buttons`：`["cmux.newTerminal", "cmux.newBrowser", "cmux.splitRight", "cmux.splitDown", "forge.newClaudeCode"]`
    - 严格 JSON（无注释、无末尾逗号）
    - 引用：[R9.1–R9.4, R9.7]，Design §3.4（完整 JSON 示例）
  - [x] 24.2 smoke test `test/cmux-mirror/cmux-json-schema.test.ts`
    - 解析 `templates/cmux.json` 为 JSON；断言必有 `commands`、`actions`、`ui` 三顶层键
    - 断言 3 种 commands 都包含 Mirror_Pane（`command` 中含 `scripts/cmux-mirror/mirror.mjs`）
    - 引用：[R9.9, R12.9]

- [x] 25. `scripts/cmux-mirror/install-template.sh` + `init.sh` 扩展
  - [x] 25.1 实现 `scripts/cmux-mirror/install-template.sh`
    - 若目标项目根不存在 `.cmux/cmux.json` → 复制 `templates/cmux.json`
    - `--force` → 覆盖前打印 diff 并提示
    - `--no-cmux` → 跳过
    - 引用：[R9.1, R9.5, R9.6]
  - [x] 25.2 修改 `scripts/init.sh`
    - 在现有初始化流程后追加一步：若未传 `--no-cmux`，调 `install-template.sh`
    - 识别并透传 `--force`
    - 引用：[R9.5, R9.6]
  - [x] 25.3 集成测试 `test/cmux-mirror/install-template.test.ts`
    - 覆盖：干净目录安装 / 已有 cmux.json 不覆盖 / `--force` 覆盖前显示 diff / `--no-cmux` 跳过
    - 引用：[R9.1, R9.5, R9.6]

- [x] 26. `browser-qa.mjs` — 浏览器 QA 回退
  - [x] 26.1 实现 `scripts/cmux-mirror/browser-qa.mjs`
    - 按 Design §4.5 的核心结构
    - 自动检测 CTK UI_Harness 已活跃 → yield
    - 使用 `cmux browser open` → `identify --json` 获取 surface_id → 执行断言
    - 超时 10s/5s/30s 分别应用于 open/identify/wait-load-state
    - 产物写 `.tinkerman/findings/<topic>/browser-qa/`
    - 引用：[R8.1–R8.9]
  - [x] 26.2 集成测试 `test/cmux-mirror/browser-qa.test.ts`
    - 用 mock-socket 模拟 cmux browser 响应
    - 覆盖：CTK UI_Harness 已活跃 → SKIPPED；surface_id 获取失败 → INCONCLUSIVE；target 不可达 → INCONCLUSIVE；正常 → VERIFIED / NOT_VERIFIED
    - 引用：[R8.1, R8.4, R8.5, R8.6, R8.8]
  - [x] 26.3 创建 `skills/forge-test/references/cmux-browser.md`
    - 描述触发条件、CTK 互让规则、产物路径、退出码语义、调用示例
    - 引用：Design §4.9

- [x] 27. `cmux-skills/` 可选技能包
  - [x] 27.1 创建 `cmux-skills/forge-sidebar-sync/SKILL.md`
    - ≤ 3072 bytes，教 agent 调 `cmux set-status` / `set-progress` / `log` 在 `forge.` 命名空间
    - 与 CanonicalSidebarPayload 对齐
    - 引用：[R10.5, R10.6]
  - [x] 27.2 创建 `cmux-skills/forge-browser-qa/SKILL.md`
    - 教 agent 用 cmux browser 命令集驱动 Browser_QA_Fallback
    - ≤ 3072 bytes
    - 引用：[R10.7]
  - [x] 27.3 创建 `cmux-skills/forge-loop-signals/SKILL.md`
    - 教 agent 发 Forge Loop 进度信号 + 读 `cmux sidebar-state --json` 自诊
    - ≤ 3072 bytes
    - 引用：[R10.8]
  - [x] 27.4 实现 `cmux-skills/install.sh`
    - 按 Design §4.10 的 bash 脚本
    - 默认 dry-run；`--apply` 写 manifest；`--uninstall` 读 manifest 删除
    - 引用：[R10.2, R10.3, R10.4]
  - [x] 27.5 集成测试 `test/cmux-mirror/cmux-skills-install.test.ts`
    - 覆盖：dry-run 不写盘 / `--apply` 写 3 个 SKILL.md + manifest / `--uninstall` 按 manifest 清理
    - 引用：[R10.2–R10.4, R10.9, R10.10]
  - [x] 27.6 smoke test 每个 SKILL.md ≤ 3072 bytes
    - 复用 `scripts/validate-skill-length.mjs` 的逻辑
    - 引用：[R10.5]

- [x] 28. `scripts/prune-event-logs.sh` 扩展 dedupe GC
  - [x] 28.1 修改 `scripts/prune-event-logs.sh`
    - 追加一段：`find .tinkerman/.cmux-dedupe -type f -mmin +60 -delete 2>/dev/null || true`
    - 不抛错、不阻塞主 GC
    - 引用：[R6.4]，Design §3.2.4

---

## Sprint 6 — 文档与收尾（≈ 1 天）

- [x] 29. SKILL reference 文档（`skills/<existing>/references/cmux.md` × 5）
  - [x] 29.1 创建 `skills/forge-review/references/cmux.md`
    - 说明 Mirror_Daemon 通过 `layers_status` frontmatter 观察；canvas 文件出现自动 emit log；SKILL 无需调 adapter 入口
    - **补充**：可选的 `push.sh layer_completed` 调用加速路径（R17）
    - 引用：[R5.2, R5.7, R15, R17.6]
  - [x] 29.2 创建 `skills/forge-build/references/cmux.md`
    - Mirror_Daemon 从 `.tinkerman/progress/<topic>.md` 读 DAG；SKILL 无需主动推送
    - 引用：[R3]
  - [x] 29.3 创建 `skills/forge-ship/references/cmux.md`
    - Mirror_Daemon 根据 status.md `phase` → `idle` 推送聚合状态
    - 引用：[R16.2]
  - [x] 29.4 创建 `skills/forge-abort/references/cmux.md`
    - abort → status.md phase 变化 / events.ndjson session_interrupted → Mirror_Daemon 清理 sidebar
    - 引用：[R4.7, R4.10]
  - [x] 29.5 创建 `skills/forge-test/references/cmux-browser.md`（若 Sprint 5 26.3 未完成，此处补齐）
    - 引用：Design §4.9

- [x] 30. README.md 更新
  - [x] 30.1 修改 `README.md`
    - 测试统计注解同步新值（≈ 22 个新文件）
    - 新增"cmux 集成"段落：说明 opt-in 使用方式（有 cmux + `⌘P` 选 Forge Workflow 布局）、Zero-Impact 保证、卸载方式
    - 引用：Design §11.5, §11.6
  - [x] 30.2 `scripts/check-readme-metrics.sh` 通过
    - 引用：Forge 现有 CI 纪律

- [x] 31. ROADMAP.md 更新
  - [x] 31.1 修改 `ROADMAP.md`
    - 登记 "Events_NDJSON 复用"：未来 `/forge learn --from-runs` 和 `/forge debug` 消费者
    - 登记 "cmux claude-teams 模式"：v3.0 Agent Teams migration
    - 引用：Out of Scope #6, #9

- [x] 32. Sprint 6 最终回归
  - [x] 32.1 运行 `npm run check` 全量通过
  - [x] 32.2 运行 `npm run test:coverage`，断言 statement coverage ≥ 89%
    - 引用：Design §8.4
  - [x] 32.3 `bash scripts/build-dist.sh`，验证新 `scripts/cmux-mirror/` 和 `templates/cmux.json` 被打包进 dist
    - 引用：§11.4

- [x] 33. 端到端演练（手工，在装了 cmux 的 macOS 开发机）
  - [x] 33.1 装 cmux nightly；`brew install --cask cmux --no-quarantine` 或官方 DMG
  - [x] 33.2 在 Forge 主仓启动 cmux → ⌘P → Forge Workflow 布局；确认 Mirror_Pane 自动拉起
  - [x] 33.3 触发 `/forge status` → 确认 sidebar 在 500ms 内显示 phase + tier
  - [x] 33.4 触发 `/forge build <小改动>` → 确认 DAG 进度条按 wave 推进
  - [x] 33.5 触发 `forge-loop "小目标" --max-iterations 3` → 确认 loop 状态推进 + 终止通知
  - [x] 33.6 触发 `/forge review` → 确认三层 log + 聚合 notify
  - [x] 33.7 故意编辑 `.tinkerman/specs/<topic>/spec.md` (status=locked) → 确认冻结拦截 + 桌面通知
  - [x] 33.8 `kill $(cat .tinkerman/.cmux-mirror.pid)` → 触发一次 `/forge status` → 确认 sync-once 自动 respawn
  - [x] 33.9 `bash scripts/cmux-mirror/push.sh resync_now` → 确认 sidebar 立即刷新
  - [x] 33.10 记录验收报告到 `.tinkerman/knowledge/sessions/cmux-integration-acceptance.md`

---

## 汇总指标

| 维度 | 数值 |
|---|---|
| 总 Sprint 数 | 6 |
| 总工作日估算 | ≈ 13 |
| 新增文件 | 22+（主要在 `scripts/cmux-mirror/`） |
| 既有 `src/` 改动 | **3 个**（`sdk-driver.ts` ≤ 100 行、`check-frozen.ts` 1 行、`review.ts` ≤ 80 行） |
| 新增 SKILL | **0** 个（本 spec） |
| 新增 npm 依赖 | `yaml`（pinned） |
| 新增测试文件 | 6 property + 14 integration + 3 smoke = 23 个 |
| 新增 assertions | ≈ 450 |

## TDD 合规检查清单

每个实现任务完成时请确认：

- [x] 先写了 RED 测试且**运行失败**才开始写实现代码
- [x] 实现完成后，测试**全部通过**（GREEN）
- [x] 代码经过一次 REFACTOR 轮（至少 review 命名 / 早返回 / 重复消除）
- [x] 既有 `npm run check` 仍绿，没引入退化
- [x] 如有 `src/` 改动，**确认**只有 R11.10 白名单的 3 个文件被碰过

## 跨 Sprint 依赖图

```ascii
Sprint 1 (lib/* + yaml + i18n + mock-socket)
      │
      ├─── Sprint 2 (events.mjs + sdk-driver.ts + reviews.mjs + review.ts)
      │           │
      │           └─── Sprint 3 (mirror.mjs 核心 + push-server)
      │                   │
      │                   └─── Sprint 4 (sync-once + hook-notify + check-frozen + hooks.json)
      │                           │
      │                           └─── Sprint 5 (cmux.json + install + browser-qa + cmux-skills)
      │                                   │
      │                                   └─── Sprint 6 (references + README + ROADMAP + E2E)
      │
      └─── 任何时候都可独立推进（打地基性质）
```

## 实现顺序建议

Sprint 1 的纯函数库可以**并行**开发（不互相依赖）。Sprint 2 必须在 Sprint 1 之后（依赖 yaml + mock-socket）。Sprint 3 依赖 Sprint 1 + Sprint 2 的全部模块。Sprint 4 依赖 Sprint 3 的 `sync-once.mjs` 所需的 `lib/respawn.mjs`。Sprint 5 和 Sprint 3 之间无强依赖，可在 Sprint 3 完成后并行 Sprint 4+5。Sprint 6 必须最后。

如有工程师并发执行，最优并发路径：

- Dev A：Sprint 1 纯函数库（任务 3–8）
- Dev B：Sprint 1 测试基础设施（任务 1）+ Sprint 5 的模板 `templates/cmux.json`（任务 24）
- Sprint 1 完成后汇合到 Sprint 2
- Sprint 2 完成后，Sprint 3 + Sprint 5 的 browser-qa 和 cmux-skills 可并行（都不依赖 sync-once）
- Sprint 4 压在 Sprint 3 之后
