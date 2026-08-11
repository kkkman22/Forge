---
topic: "cmux-integration"
status: "approved"
date: "2026-05-08"
spec_ref: ".kiro/specs/cmux-integration"
format: "lightweight"
---

## Objective

为 Forge 增加可选的 cmux 集成层：通过独立守护进程 Mirror_Daemon 观察 `.tinkerman/` 状态文件，将 Forge 生命周期（路由、DAG 进度、评审结果、Forge Loop 迭代、冻结拦截）以结构化形式投射到 cmux 侧边栏、通知和浏览器 surface。同时追加 Events_NDJSON 事件流（服务多个未来消费者）和 Reviews Frontmatter 扩展。严格遵守 Zero-Impact 不变量：未安装 cmux 时 Forge 行为零变化。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| design.md#1-overview | 观察者架构总览：Mirror_Daemon + Sync_Once + Push Socket + 共享库 |
| design.md#2-component-architecture | 组件清单、既有模块最小扩展（3 个 src/ 文件）、hooks 扩展、SKILL references |
| design.md#3-data-design | 目录结构、Events_NDJSON schema、Reviews frontmatter schema、CanonicalSidebarPayload 类型 |
| design.md#4.1-availability | cmuxAvailable() 检测 + 粘性降级状态机 |
| design.md#4.2-mirror-daemon | 守护进程启动流程（12 步）、事件分发（防抖 250ms）、sticky-unavailable |
| design.md#4.3-sync-once | hook 触发的一次性同步 + 受限 respawn |
| design.md#4.4-hook-notify | 冻结拦截通知 + dedupe 读写 |
| design.md#4.5-browser-qa | 浏览器 QA 回退：cmux browser 命令集驱动 |
| design.md#4.6-push-server | Mirror_Push_Socket 监听 + rate limit 20/s |
| design.md#4.7-events-ndjson | Events_NDJSON 写入侧（sdk-driver.ts）+ 读取侧（lib/events.mjs） |
| design.md#4.8-reviews-frontmatter | Reviews frontmatter 原子重写 |
| design.md#4.9-references | SKILL reference 文档说明 |
| design.md#4.10-cmux-skills | 可选技能包 install/uninstall |
| design.md#5-mapping-tables | Phase→icon, Tier→color, Loop→icon 映射表 |
| design.md#8-testing | 测试策略：mock-socket + fast-check property tests |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `scripts/cmux-mirror/mirror.mjs` | CREATE | 守护进程：fs.watch 主循环 + push-server + 会话状态机 |
| `scripts/cmux-mirror/sync-once.mjs` | CREATE | hook 触发：一次性读 .tinkerman/ → 推 cmux；respawn 受限自愈 |
| `scripts/cmux-mirror/push.sh` | CREATE | SKILL 主动推送瘦包装 |
| `scripts/cmux-mirror/hook-notify.sh` | CREATE | 冻结拦截通知（含 dedupe） |
| `scripts/cmux-mirror/browser-qa.mjs` | CREATE | /forge test 浏览器 QA 回退 |
| `scripts/cmux-mirror/install-template.sh` | CREATE | init.sh 调用：拷贝 cmux.json |
| `scripts/cmux-mirror/lib/availability.mjs` | CREATE | cmuxAvailable() + 粘性降级 |
| `scripts/cmux-mirror/lib/capabilities.mjs` | CREATE | cmux capabilities --json 缓存 |
| `scripts/cmux-mirror/lib/payload.mjs` | CREATE | CanonicalSidebarPayload + 映射表 |
| `scripts/cmux-mirror/lib/reader.mjs` | CREATE | 纯函数：从 .tinkerman/ 读状态合成 payload |
| `scripts/cmux-mirror/lib/emitter.mjs` | CREATE | 纯函数：payload → cmux CLI 命令序列 |
| `scripts/cmux-mirror/lib/events.mjs` | CREATE | Events_NDJSON 解析 + 字节游标 |
| `scripts/cmux-mirror/lib/reviews.mjs` | CREATE | reviews frontmatter 解析与差分 |
| `scripts/cmux-mirror/lib/session.mjs` | CREATE | Forge_Session 边界检测状态机 |
| `scripts/cmux-mirror/lib/budget.mjs` | CREATE | ProcessNotificationBudget 单调计数 |
| `scripts/cmux-mirror/lib/dedupe.mjs` | CREATE | HookDedupeWindow 文件系统 TTL |
| `scripts/cmux-mirror/lib/push-server.mjs` | CREATE | Unix socket 监听 + rate limit |
| `scripts/cmux-mirror/lib/respawn.mjs` | CREATE | Respawn_Budget 原子计数 |
| `scripts/cmux-mirror/lib/cli.mjs` | CREATE | cmux CLI 子进程封装 |
| `src/sdk-driver.ts` | MODIFY | 追加 Events_NDJSON 写入（≤ 100 行，9 个切点） |
| `src/check-frozen.ts` | MODIFY | 尾部追加 1 行 exec hook-notify.sh |
| `src/review.ts` | MODIFY | 原子重写 layers_status / completed_at（≤ 80 行） |
| `templates/cmux.json` | CREATE | 3 种布局（含 Mirror_Pane × 3） |
| `templates/config.md` | MODIFY | 注释模板新增 5 个 optional cmux 字段 |
| `locales/zh.json` | MODIFY | 追加 cmux 相关 i18n key（约 22 条） |
| `locales/en.json` | MODIFY | 追加 cmux 相关 i18n key（约 22 条） |
| `hooks/hooks.json` | MODIFY | 追加 3 条非阻塞 sync-once 条目 |
| `scripts/prune-event-logs.sh` | MODIFY | 追加 dedupe GC 段 |
| `scripts/init.sh` | MODIFY | 追加 install-template.sh 调用 |
| `skills/forge/lib/forge-cmux-sidebar-sync/instructions.md` | CREATE | 可选技能：侧边栏同步（moved by spec cmux-skills-collapse） |
| `skills/forge/lib/forge-cmux-browser-qa/instructions.md` | CREATE | 可选技能：浏览器 QA（moved by spec cmux-skills-collapse） |
| `skills/forge/lib/forge-cmux-loop-signals/instructions.md` | CREATE | 可选技能：Loop 信号（moved by spec cmux-skills-collapse） |
| `cmux-skills/install.sh` | DELETE | removed by spec cmux-skills-collapse |
| `skills/forge-review/references/cmux.md` | CREATE | review cmux 集成参考 |
| `skills/forge-build/references/cmux.md` | CREATE | build cmux 集成参考 |
| `skills/forge-ship/references/cmux.md` | CREATE | ship cmux 集成参考 |
| `skills/forge-abort/references/cmux.md` | CREATE | abort cmux 集成参考 |
| `skills/forge-test/references/cmux-browser.md` | CREATE | test 浏览器 QA 参考 |
| `README.md` | MODIFY | 新增 cmux 集成段落 + 测试统计 |
| `ROADMAP.md` | MODIFY | 登记 Events_NDJSON 复用 + cmux claude-teams |
| `test/cmux-mirror/mock-socket.ts` | CREATE | cmux Unix socket 模拟 |
| `test/cmux-mirror/fixtures/*.json/*.md/*.ndjson` | CREATE | 测试固件（7 个文件） |
| `test/cmux-mirror/availability.property.test.ts` | CREATE | 可用性属性测试 |
| `test/cmux-mirror/sticky-unavailable.test.ts` | CREATE | 粘性降级集成测试 |
| `test/cmux-mirror/capabilities.test.ts` | CREATE | 能力探测测试 |
| `test/cmux-mirror/payload-mapping.property.test.ts` | CREATE | 映射表属性测试 |
| `test/cmux-mirror/budget-monotonic.property.test.ts` | CREATE | 预算单调性属性测试 |
| `test/cmux-mirror/dedupe-idempotent.property.test.ts` | CREATE | 去重幂等性属性测试 |
| `test/cmux-mirror/events-tolerance.property.test.ts` | CREATE | 事件流容错属性测试 |
| `test/cmux-mirror/session-totality.property.test.ts` | CREATE | 会话状态机属性测试 |
| `test/cmux-mirror/sdk-driver-events.test.ts` | CREATE | sdk-driver 事件写入测试 |
| `test/cmux-mirror/reviews-parse.test.ts` | CREATE | reviews 解析测试 |
| `test/cmux-mirror/reviews-frontmatter-schema.test.ts` | CREATE | reviews frontmatter schema 测试 |
| `test/cmux-mirror/reader-emitter-roundtrip.test.ts` | CREATE | reader-emitter 往返测试 |
| `test/cmux-mirror/push-socket.test.ts` | CREATE | push socket 测试 |
| `test/cmux-mirror/push-sh-integration.test.ts` | CREATE | push.sh 脚本集成测试 |
| `test/cmux-mirror/mirror-startup.test.ts` | CREATE | mirror 启动分支测试 |
| `test/cmux-mirror/mirror-fs-watch.test.ts` | CREATE | mirror fs.watch 测试 |
| `test/cmux-mirror/mirror-polling-fallback.test.ts` | CREATE | mirror polling 降级测试 |
| `test/cmux-mirror/mirror-events-consume.test.ts` | CREATE | mirror 事件消费测试 |
| `test/cmux-mirror/mirror-review-observe.test.ts` | CREATE | mirror review 观察测试 |
| `test/cmux-mirror/mirror-session-boundary.test.ts` | CREATE | mirror session 边界测试 |
| `test/cmux-mirror/mirror-push-socket.test.ts` | CREATE | mirror push socket 测试 |
| `test/cmux-mirror/tmux-passthrough.test.ts` | CREATE | tmux 透传测试 |
| `test/cmux-mirror/sync-once.test.ts` | CREATE | sync-once 分支测试 |
| `test/cmux-mirror/hook-notify.test.ts` | CREATE | hook-notify 集成测试 |
| `test/cmux-mirror/check-frozen-integration.test.ts` | CREATE | check-frozen 集成测试 |
| `test/cmux-mirror/hooks-integration.test.ts` | CREATE | hooks.json 结构验证测试 |
| `test/cmux-mirror/cmux-json-schema.test.ts` | CREATE | cmux.json smoke 测试 |
| `test/cmux-mirror/install-template.test.ts` | CREATE | 模板安装测试 |
| `test/cmux-mirror/browser-qa.test.ts` | CREATE | 浏览器 QA 测试 |
| `test/cmux-mirror/cmux-skills-install.test.ts` | CREATE | 技能包安装测试 |
| `test/cmux-mirror/i18n-parity.test.ts` | CREATE | i18n key 一致性测试 |
| `test/cmux-mirror/respawn-budget.test.ts` | CREATE | respawn 预算测试 |

## Task Breakdown

### Sprint 1 — 打地基：纯函数库 + 依赖 + i18n

---

### Task 1: mock-socket 测试基础设施
- **Goal**: 创建 cmux Unix socket JSON-RPC 模拟 + 测试 fixtures
- **File**: `test/cmux-mirror/mock-socket.ts`, `test/cmux-mirror/fixtures/*.json/*.md/*.ndjson`
- **Design Reference**: design.md#8.2 — mock-socket 模拟 cmux socket JSON-RPC 响应
- **Property**: —
- **Depends On**: (none)
- **Verify**: `npx vitest run test/cmux-mirror/mock-socket.ts`
- **Commit**: `feat(cmux): add mock-socket test harness and fixtures`

---

### Task 2: 添加 yaml npm 依赖
- **Goal**: 安装 yaml 库用于 frontmatter 原子重写
- **File**: `package.json`
- **Design Reference**: design.md#2.1 — 新依赖 yaml (npm)
- **Property**: —
- **Depends On**: (none)
- **Verify**: `node scripts/check-deps.mjs && node -e "require('yaml')"`
- **Commit**: `feat(cmux): add yaml dependency for frontmatter serialization`

---

### Task 3: lib/availability.mjs — 可用性检测
- **Goal**: 实现 cmuxAvailable() + 粘性降级 + CMUX_INTEGRATION 短路
- **File**: `scripts/cmux-mirror/lib/availability.mjs`
- **Design Reference**: design.md#4.1 — 核心签名与 sticky-unavailable 状态机
- **Property**: R12.1 (idempotence), R1.2 (timeout safety)
- **Depends On**: (none)
- **Verify**: `npx vitest run test/cmux-mirror/availability.property.test.ts test/cmux-mirror/sticky-unavailable.test.ts`
- **Commit**: `feat(cmux): implement availability detection with sticky degradation`

---

### Task 4: lib/capabilities.mjs — cmux 能力探测
- **Goal**: 启动时调 cmux capabilities --json → 内存缓存，超时 2s 硬截断
- **File**: `scripts/cmux-mirror/lib/capabilities.mjs`
- **Design Reference**: design.md#4.6 — cmux CLI 子进程封装
- **Property**: R13.5 (capability skip)
- **Depends On**: Task 3
- **Verify**: `npx vitest run test/cmux-mirror/capabilities.test.ts`
- **Commit**: `feat(cmux): implement cmux capabilities probe with cache`

---

### Task 5: lib/payload.mjs — 映射表
- **Goal**: 导出 PHASE_TO_ICON / TIER_TO_COLOR / LOOP_STATE_TO_ICON + phaseToIcon() / tierToColor()
- **File**: `scripts/cmux-mirror/lib/payload.mjs`
- **Design Reference**: design.md#3.5 / design.md#5 — 映射表纯数据常量
- **Property**: R12.3 (icon totality), R12.4 (color totality)
- **Depends On**: (none)
- **Verify**: `npx vitest run test/cmux-mirror/payload-mapping.property.test.ts`
- **Commit**: `feat(cmux): implement sidebar payload mapping tables`

---

### Task 6: lib/budget.mjs — 通知预算
- **Goal**: 实现 createBudget(initial) / .consume() / .reset() 单调非增计数器
- **File**: `scripts/cmux-mirror/lib/budget.mjs`
- **Design Reference**: design.md#4.2.5 / design.md#5.2 — ProcessNotificationBudget
- **Property**: R12.2 (monotone non-increasing), R7.3, R7.5
- **Depends On**: (none)
- **Verify**: `npx vitest run test/cmux-mirror/budget-monotonic.property.test.ts`
- **Commit**: `feat(cmux): implement notification budget counter`

---

### Task 7: lib/dedupe.mjs — 文件系统 TTL 去重
- **Goal**: 实现 checkAndRecord(filePath, dedupeDir, windowMs) → { notify: boolean }
- **File**: `scripts/cmux-mirror/lib/dedupe.mjs`
- **Design Reference**: design.md#3.2.4 / design.md#4.4 — HookDedupeWindow
- **Property**: R12.8 (idempotent within window)
- **Depends On**: (none)
- **Verify**: `npx vitest run test/cmux-mirror/dedupe-idempotent.property.test.ts`
- **Commit**: `feat(cmux): implement filesystem TTL dedup for hook notifications`

---

### Task 8: lib/cli.mjs — cmux CLI 子进程封装
- **Goal**: 实现 runCli(args, { timeoutMs }) → Promise<{exitCode, stdout, stderr} | null>
- **File**: `scripts/cmux-mirror/lib/cli.mjs`
- **Design Reference**: design.md#4.6 — cmux CLI 封装，EPIPE/ECONNREFUSED → markUnavailable
- **Property**: —
- **Depends On**: Task 3
- **Verify**: `npx vitest run test/cmux-mirror/`
- **Commit**: `feat(cmux): implement cmux CLI subprocess wrapper`

---

### Task 9: config 字段 + i18n key 同步
- **Goal**: 模板 config.md 新增 5 个 optional 字段；zh.json / en.json 追加约 22 条 i18n key
- **File**: `templates/config.md`, `locales/zh.json`, `locales/en.json`
- **Design Reference**: design.md#3.3 — config frontmatter 新增字段
- **Property**: R11.4 (i18n parity)
- **Depends On**: (none)
- **Verify**: `npx vitest run test/cmux-mirror/i18n-parity.test.ts`
- **Commit**: `feat(cmux): add cmux config fields and i18n keys`

---

### Task 10: Sprint 1 回归
- **Goal**: npm run check 全量通过，确认新增 property test + unit test 全绿
- **File**: —
- **Design Reference**: design.md#8.1 — 测试策略
- **Property**: —
- **Depends On**: Task 1–9
- **Verify**: `npm run check`
- **Commit**: (no separate commit — last Sprint 1 task commit includes verification)

---

### Sprint 2 — Events_NDJSON 与 Reviews Frontmatter

---

### Task 11: lib/events.mjs — Events_NDJSON 解析
- **Goal**: 实现 readEventsSince(path, cursor) → {events, cursor}，容忍 malformed 行
- **File**: `scripts/cmux-mirror/lib/events.mjs`
- **Design Reference**: design.md#4.7 — Events_NDJSON 读取侧
- **Property**: R12.11 (tolerance), R14.6, R14.9 (schema_version filter)
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/cmux-mirror/events-tolerance.property.test.ts`
- **Commit**: `feat(cmux): implement events NDJSON parser with cursor tracking`

---

### Task 12: src/sdk-driver.ts — 追加 Events_NDJSON 写入
- **Goal**: 新增 writeEvent(type, payload) 辅助方法，在 9 个切点追加事件行
- **File**: `src/sdk-driver.ts`
- **Design Reference**: design.md#4.7 — Events_NDJSON 写入侧，9 个切点
- **Property**: R14.1, R14.2, R14.3, R14.8 (redaction)
- **Depends On**: Task 11
- **Verify**: `npx vitest run test/cmux-mirror/sdk-driver-events.test.ts && npm run check`
- **Commit**: `feat(cmux): append Events_NDJSON writes to sdk-driver lifecycle hooks`

---

### Task 13: lib/reviews.mjs — Reviews frontmatter 读取
- **Goal**: 实现 parseReviewFrontmatter(path) + isReviewComplete(fm) 纯函数
- **File**: `scripts/cmux-mirror/lib/reviews.mjs`
- **Design Reference**: design.md#4.8 — Reviews frontmatter 读取侧
- **Property**: R15.7 (old format tolerance)
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/cmux-mirror/reviews-parse.test.ts`
- **Commit**: `feat(cmux): implement reviews frontmatter parser`

---

### Task 14: src/review.ts — frontmatter 原子重写
- **Goal**: 新增 initReviewFrontmatter / markLayerStatus / atomicUpdateFrontmatter，在 /forge review 执行流里调用
- **File**: `src/review.ts`
- **Design Reference**: design.md#4.8 — Reviews frontmatter 原子重写（read → parse → mutate → tmp → rename）
- **Property**: R15.1–R15.6, R15.8
- **Depends On**: Task 2, Task 13
- **Verify**: `npx vitest run test/cmux-mirror/reviews-frontmatter-schema.test.ts && npm run check`
- **Commit**: `feat(cmux): extend review.ts with atomic layers_status frontmatter rewrite`

---

### Sprint 3 — Mirror_Daemon 核心 + Push 通道

---

### Task 15: lib/session.mjs — Forge_Session 状态机
- **Goal**: 实现 SessionTracker class，支持 onStatusChange / onEvent / tickIdle，per-Workspace_Ref 独立
- **File**: `scripts/cmux-mirror/lib/session.mjs`
- **Design Reference**: design.md#4.2.5 — 会话状态机（unknown/active/inactive）
- **Property**: R12.12 (totality), R16.1–R16.8
- **Depends On**: Task 6
- **Verify**: `npx vitest run test/cmux-mirror/session-totality.property.test.ts`
- **Commit**: `feat(cmux): implement Forge session boundary state machine`

---

### Task 16: lib/respawn.mjs — Respawn_Budget 计数
- **Goal**: 实现 tryConsumeRespawn / resetRespawnCount，原子文件读写
- **File**: `scripts/cmux-mirror/lib/respawn.mjs`
- **Design Reference**: design.md#2.1 / design.md#4.3 — Respawn_Budget
- **Property**: R13.12–R13.14
- **Depends On**: (none)
- **Verify**: `npx vitest run test/cmux-mirror/respawn-budget.test.ts`
- **Commit**: `feat(cmux): implement respawn budget counter with atomic file ops`

---

### Task 17: lib/reader.mjs + lib/emitter.mjs — 状态读取与命令生成
- **Goal**: reader 从 .tinkerman/ 合成 CanonicalSidebarPayload；emitter 将 payload 变化翻译为 cmux CLI 命令序列
- **File**: `scripts/cmux-mirror/lib/reader.mjs`, `scripts/cmux-mirror/lib/emitter.mjs`
- **Design Reference**: design.md#2.1 — reader 读状态、emitter 生成命令
- **Property**: R2.1, R2.2, R12.10, R3.2, R4.2, R13.5
- **Depends On**: Task 5, Task 4, Task 8
- **Verify**: `npx vitest run test/cmux-mirror/reader-emitter-roundtrip.test.ts`
- **Commit**: `feat(cmux): implement state reader and cmux command emitter`

---

### Task 18: lib/push-server.mjs + push.sh — Mirror_Push_Socket
- **Goal**: Unix socket 监听 NDJSON，rate limit 20/s，事件分发到 dispatch；push.sh 瘦包装
- **File**: `scripts/cmux-mirror/lib/push-server.mjs`, `scripts/cmux-mirror/push.sh`
- **Design Reference**: design.md#4.6a — Mirror_Push_Socket
- **Property**: R17.1–R17.4, R17.8
- **Depends On**: Task 3, Task 8
- **Verify**: `npx vitest run test/cmux-mirror/push-socket.test.ts test/cmux-mirror/push-sh-integration.test.ts`
- **Commit**: `feat(cmux): implement Mirror Push Socket with rate limiting`

---

### Task 19: mirror.mjs 主程序
- **Goal**: 完整守护进程：12 步启动、fs.watch / polling 双模式、防抖 250ms、信号处理、集成所有 lib
- **File**: `scripts/cmux-mirror/mirror.mjs`
- **Design Reference**: design.md#4.2 — 启动流程 12 步、事件分发、fs-type 检测
- **Property**: R1.5–R1.10, R2.1–R2.10, R3.1–R3.5, R4.1–R4.10, R5.1–R5.7, R13.5, R16, R17
- **Depends On**: Task 3–8, Task 11, Task 13, Task 15–18
- **Verify**: `npx vitest run test/cmux-mirror/mirror-*.test.ts test/cmux-mirror/tmux-passthrough.test.ts`
- **Commit**: `feat(cmux): implement Mirror_Daemon main process with fs.watch and polling`

---

### Sprint 4 — Sync_Once / Hook 接入

---

### Task 20: sync-once.mjs 一次性同步
- **Goal**: 9 步流程：可用性检测 → 非 Forge 退出 → 锁 → respawn 检查 → 读状态 → 生成命令 → diff → 发射 → 更新快照
- **File**: `scripts/cmux-mirror/sync-once.mjs`
- **Design Reference**: design.md#4.3 — Sync_Once 9 步流程
- **Property**: R2.7–R2.10, R13.12–R13.14
- **Depends On**: Task 16, Task 17
- **Verify**: `npx vitest run test/cmux-mirror/sync-once.test.ts`
- **Commit**: `feat(cmux): implement sync-once defensive sync with respawn`

---

### Task 21: hook-notify.sh 冻结拦截通知
- **Goal**: Bash 脚本：dedupe 检查 → cmux notify / log，所有 cmux 调用 || true，exit 永远 0
- **File**: `scripts/cmux-mirror/hook-notify.sh`
- **Design Reference**: design.md#4.4 — hook-notify 瘦封装
- **Property**: R6.1–R6.7, R12.7
- **Depends On**: Task 7
- **Verify**: `npx vitest run test/cmux-mirror/hook-notify.test.ts`
- **Commit**: `feat(cmux): implement frozen interception notification hook`

---

### Task 22: src/check-frozen.ts — 尾部 1 行 exec
- **Goal**: 阻断决策之后、exit 之前追加 1 行 fire-and-forget spawn hook-notify.sh，不改判定逻辑
- **File**: `src/check-frozen.ts`
- **Design Reference**: design.md#2.2 — check-frozen.ts 1 行扩展
- **Property**: R6.1, R11.10.b, R12.7 (exit code invariant)
- **Depends On**: Task 21
- **Verify**: `npx vitest run test/cmux-mirror/check-frozen-integration.test.ts && npm run check`
- **Commit**: `feat(cmux): append hook-notify spawn to check-frozen interception`

---

### Task 23: hooks/hooks.json 追加 3 条 sync-once 条目
- **Goal**: UserPromptSubmit / PostToolUse(Write|Edit) / Stop 各追加一条 sync-once 命令，timeout 2s
- **File**: `hooks/hooks.json`
- **Design Reference**: design.md#2.3 — hooks 扩展（仅追加）
- **Property**: R2.7
- **Depends On**: Task 20
- **Verify**: `npx vitest run test/cmux-mirror/hooks-integration.test.ts`
- **Commit**: `feat(cmux): append sync-once hook entries to hooks.json`

---

### Sprint 5 — 模板 / 可选包 / Browser QA

---

### Task 24: templates/cmux.json — Forge 专属布局
- **Goal**: 三种布局（Workflow / Loop Monitor / Dev），每种含 15% Mirror_Pane + forge.newClaudeCode action + ui button list
- **File**: `templates/cmux.json`
- **Design Reference**: design.md#3.4 — 完整 JSON 示例
- **Property**: R9.1–R9.4, R9.7, R12.9
- **Depends On**: (none)
- **Verify**: `npx vitest run test/cmux-mirror/cmux-json-schema.test.ts`
- **Commit**: `feat(cmux): create Forge workspace layout templates`

---

### Task 25: install-template.sh + init.sh 扩展
- **Goal**: 安装脚本：不存在则拷贝、--force 覆盖前 diff、--no-cmux 跳过；init.sh 追加调用
- **File**: `scripts/cmux-mirror/install-template.sh`, `scripts/init.sh`
- **Design Reference**: design.md#4.10 — install-template.sh
- **Property**: R9.1, R9.5, R9.6
- **Depends On**: Task 24
- **Verify**: `npx vitest run test/cmux-mirror/install-template.test.ts`
- **Commit**: `feat(cmux): implement cmux.json template installer`

---

### Task 26: browser-qa.mjs — 浏览器 QA 回退
- **Goal**: cmux browser 命令集驱动端到端 QA，CTK 互让，三态 verdict 产物
- **File**: `scripts/cmux-mirror/browser-qa.mjs`, `skills/forge-test/references/cmux-browser.md`
- **Design Reference**: design.md#4.5 — browser-qa 核心结构
- **Property**: R8.1–R8.9
- **Depends On**: Task 8
- **Verify**: `npx vitest run test/cmux-mirror/browser-qa.test.ts`
- **Commit**: `feat(cmux): implement browser QA fallback with cmux browser commands`

---

### Task 27: cmux-skills/ 可选技能包
- **Goal**: 3 个 SKILL.md（≤3072 bytes each）+ install.sh（dry-run/--apply/--uninstall）
- **File**: ~~`cmux-skills/forge-sidebar-sync/SKILL.md`~~, ~~`cmux-skills/forge-browser-qa/SKILL.md`~~, ~~`cmux-skills/forge-loop-signals/SKILL.md`~~, ~~`cmux-skills/install.sh`~~ — 旧路径已 superseded，新路径见顶部 File Mapping 中 `skills/forge/lib/forge-cmux-{sidebar-sync,browser-qa,loop-signals}/instructions.md`（详见 `.kiro/specs/cmux-skills-collapse/`）
- **Design Reference**: design.md#4.10 — cmux-skills 可选技能包
- **Property**: R10.1–R10.10
- **Depends On**: Task 5, Task 8
- **Verify**: `npx vitest run test/cmux-mirror/cmux-skills-install.test.ts`
- **Commit**: `feat(cmux): add optional cmux skills bundle with installer`
- **Notes**: → superseded by .kiro/specs/cmux-skills-collapse/

---

### Task 28: prune-event-logs.sh 扩展 dedupe GC
- **Goal**: 追加 find .tinkerman/.cmux-dedupe -type f -mmin +60 -delete
- **File**: `scripts/prune-event-logs.sh`
- **Design Reference**: design.md#3.2.4 — dedupe GC
- **Property**: R6.4
- **Depends On**: (none)
- **Verify**: `bash scripts/prune-event-logs.sh --dry-run 2>&1 | grep -q cmux-dedupe`
- **Commit**: `feat(cmux): extend prune-event-logs with dedupe GC`

---

### Sprint 6 — 文档与收尾

---

### Task 29: SKILL reference 文档
- **Goal**: 5 个 references/cmux.md（forge-review / forge-build / forge-ship / forge-abort / forge-test）
- **File**: `skills/forge-review/references/cmux.md`, `skills/forge-build/references/cmux.md`, `skills/forge-ship/references/cmux.md`, `skills/forge-abort/references/cmux.md`, `skills/forge-test/references/cmux-browser.md`
- **Design Reference**: design.md#4.9 — SKILL reference 文档
- **Property**: R5.2, R5.7, R15, R3, R16.2, R4.7, R4.10
- **Depends On**: (none — documentation only)
- **Verify**: `ls skills/forge-{review,build,ship,abort}/references/cmux.md skills/forge-test/references/cmux-browser.md`
- **Commit**: `docs(cmux): add SKILL reference docs for cmux integration`

---

### Task 30: README.md 更新
- **Goal**: 测试统计注解 + "cmux 集成"段落（opt-in 使用、Zero-Impact、卸载）
- **File**: `README.md`
- **Design Reference**: design.md#11.5 / design.md#11.6
- **Property**: —
- **Depends On**: (none — documentation only)
- **Verify**: `bash scripts/check-readme-metrics.sh`
- **Commit**: `docs(cmux): update README with cmux integration section`
- **Notes**: → rewritten per .kiro/specs/cmux-skills-collapse/ R6

---

### Task 31: ROADMAP.md 更新
- **Goal**: 登记 Events_NDJSON 复用 + cmux claude-teams 模式
- **File**: `ROADMAP.md`
- **Design Reference**: Out of Scope #6, #9
- **Property**: —
- **Depends On**: (none — documentation only)
- **Verify**: `grep -q "Events_NDJSON" ROADMAP.md`
- **Commit**: `docs(cmux): register cmux-related roadmap items`

---

### Task 32: Sprint 6 最终回归
- **Goal**: npm run check + 覆盖率 ≥ 89% + build-dist.sh 验证打包
- **File**: —
- **Design Reference**: design.md#8.4 — 覆盖率目标
- **Property**: —
- **Depends On**: Task 1–31
- **Verify**: `npm run check && npm run test:coverage && bash scripts/build-dist.sh`
- **Commit**: (no separate commit — verification task)

---

### Task 33: 端到端手工验收
- **Goal**: 在装了 cmux 的 macOS 开发机上跑 10 步验收序列
- **File**: `.tinkerman/knowledge/sessions/cmux-integration-acceptance.md`
- **Design Reference**: design.md#11 — 验收
- **Property**: —
- **Depends On**: Task 32
- **Verify**: 验收报告存在且所有 10 步通过
- **Commit**: `docs(cmux): add E2E acceptance report`

---

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1: 可用性检测与零影响降级 | Task 3, Task 19 |
| R2: 阶段状态 → 侧边栏同步 | Task 17, Task 19, Task 20 |
| R3: DAG 并行进度 → 进度条 | Task 17, Task 19 |
| R4: Forge Loop → 长时运行信号 | Task 11, Task 12, Task 19 |
| R5: 评审结果 → 侧边栏与通知 | Task 13, Task 14, Task 19, Task 29 |
| R6: 冻结拦截 → 侧边栏与通知 | Task 7, Task 21, Task 22 |
| R7: Forge Session 通知预算 | Task 6, Task 15 |
| R8: 浏览器 QA 回退 | Task 26 |
| R9: Forge 专属 cmux 工作区布局 | Task 24, Task 25 |
| R10: Cmux Forge 技能包（可选） | Task 27 |
| R11: 非功能性约束 | Task 1, Task 9, Task 10, Task 32 |
| R12: 不变量与正确性属性 | Task 3, Task 5, Task 6, Task 7, Task 11, Task 15 |
| R13: 边界条件与失败模式 | Task 3, Task 4, Task 16, Task 19, Task 20 |
| R14: Events_NDJSON 事件流规范 | Task 11, Task 12 |
| R15: Reviews Frontmatter 扩展 | Task 13, Task 14 |
| R16: Forge_Session 边界定义 | Task 15, Task 19 |
| R17: Mirror Push 通道 | Task 18, Task 19 |

## Execution Strategy

Sprint 1 的 Task 1–8（纯函数库）可并行开发。Sprint 2 依赖 Sprint 1。Sprint 3 依赖 Sprint 1+2。Sprint 4 依赖 Sprint 3。Sprint 5 与 Sprint 3 无强依赖，可在 Sprint 3 后与 Sprint 4 并行。Sprint 6 最后。

## Metrics

| 维度 | 数值 |
|------|------|
| 总 Sprint 数 | 6 |
| 总任务数 | 33 |
| 新增文件 | 22+ (scripts/cmux-mirror/) |
| 既有 src/ 改动 | 3 (sdk-driver.ts ≤100行, check-frozen.ts 1行, review.ts ≤80行) |
| 新增测试文件 | 23 |
| 新增 npm 依赖 | 1 (yaml) |
