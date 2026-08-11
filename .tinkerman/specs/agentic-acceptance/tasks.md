---
feature: agentic-acceptance
layout: tasks
created: 2026-06-17
spec_ref: .tinkerman/specs/agentic-acceptance/
decision_ref: .tinkerman/decisions/2026-06-17-agentic-acceptance-with-agent-browser.md
format: lightweight
monolith_acknowledged: true
---

# Tasks — Agentic Acceptance

> 三文件单源 plan。Spec 已 lock。每任务遵循 TDD（RED→GREEN→REFACTOR），完成即原子提交。
> **Vertical Slice 约束**：任务按端到端行为切片，不按技术层拆分。
> **Zero Context**：每个 step 含执行者所需的全部信息（含项目约定引用）。

## 项目踩坑本能（从 .tinkerman/knowledge/instincts.md 注入，所有外部命令任务必读）

- **外部命令**：用纯函数返回 `{ executable, args }` 描述符 + `execFileSync`/`execFile`，绝不拼接命令字符串，入口 `validate()` 用 reject 策略。（Confidence 0.8，来源 ship-delivery-pure-functions）
- **正则**：`.test()` 永远内联正则（`/pattern/.test(str)`），不用 `/g` flag（lastIndex 残留 bug）。（Confidence 0.85）
- **安全验证**：字符白名单不够，需多字符序列检查（`..`、`@{` 等）。（Confidence 0.7）

---

## Wave 1 — 类型与纯函数基础（无外部依赖）

### T1.1 扩展 Verdict 联合类型加 INCONCLUSIVE  [AFK] [dependsOn: []]
**Spec**: R2-AC1, R2-AC3, R2-AC4  | **est**: 8 min  | **nature**: infrastructure
- **RED**: `test/verdict-inconclusive.test.ts`
  - 断言 `Verdict` 类型含 `"INCONCLUSIVE"`（TS 编译期）
  - `aggregateVerdicts([{verdict:"INCONCLUSIVE"},{verdict:"PASS"}])` → `blocksShip:false` 且 `inconclusive===1` 且 `fail===0`
  - `aggregateVerdicts([{verdict:"FAIL"},{verdict:"INCONCLUSIVE"}])` → `blocksShip:true`，`fail===1`，`inconclusive===1`
- **GREEN** (MODIFY `src/accept.ts`): `Verdict` 加 `"INCONCLUSIVE"`；`aggregateVerdicts` 累加 `inconclusive` 计数，`blocksShip` 仅看 `fail`。
- **Verify**: `npx vitest run test/verdict-inconclusive.test.ts` → all pass

### T1.2 evaluateUiVerdict 纯函数  [AFK] [dependsOn: []]
**Spec**: R1-AC5  | **est**: 15 min  | **nature**: vertical-slice（解析→判定切片）
- **RED**: `test/evaluate-ui-verdict.test.ts`
  - PASS case: snapshot `{url:"/dashboard",title:"控制台",text:"欢迎 admin"}` + then `"跳转到 dashboard 且显示 欢迎"` → `"PASS"`
  - FAIL case: snapshot `{url:"/login",...}` + 同 then → `"FAIL"`
  - 边界: then 含多关键词全满足才 PASS；url 后缀匹配（`/dashboard` 命中 `/dashboard/x`）
- **GREEN** (CREATE `src/evaluate-ui-verdict.ts`): 导出 `evaluateUiVerdict(snapshot, thenClause)`，用内联正则（无 /g）做 url/title/text 关键词包含匹配。
- **Verify**: `npx vitest run test/evaluate-ui-verdict.test.ts` → all pass

### T1.3 脱敏与 allowlist 纯函数  [AFK] [dependsOn: []]
**Spec**: R4-AC4, R4-AC5  | **est**: 12 min  | **nature**: vertical-slice（安全切片）
- **RED**: `test/accept-security.test.ts`
  - `redactSnapshot("Set-Cookie: token=abc\nAuthorization: Bearer xyz")` → `"Set-Cookie: [REDACTED]\nAuthorization: [REDACTED]"`
  - `redactSnapshot("password=admin123")` → `"password=[REDACTED]"`
  - `isUrlAllowed("http://192.168.1.1", ["localhost","127.0.0.1"])` → `false`
  - `isUrlAllowed("http://localhost:5173", ["localhost","127.0.0.1"])` → `true`
- **GREEN** (CREATE `src/accept-security.ts`): 导出 `redactSnapshot(text)` 和 `isUrlAllowed(url, allowlistHosts)`。正则内联。
- **Verify**: `npx vitest run test/accept-security.test.ts` → all pass

---

## Wave 2 — AgentBrowserClient 与 Runner

### T2.1 AgentBrowserClient 接口 + Fake  [AFK] [dependsOn: []]
**Spec**: R1-AC3, NFR-3  | **est**: 15 min  | **nature**: infrastructure
- **RED**: `test/agent-browser-client.test.ts`
  - 定义 interface（见 design.md §2.3）；FakeAgentBrowserClient 各方法返回固定 JSON。
  - 断言 `open("http://localhost:5173","s1")` 不抛错；`snapshot("s1")` 返回含 `refs:[{ref:"e3",tag:"button",text:"登录"}]`。
- **GREEN** (CREATE `src/agent-browser-client.ts`): 导出 interface `AgentBrowserClient` + `SnapshotRef` 类型 + `FakeAgentBrowserClient` 类。
- **Verify**: `npx vitest run test/agent-browser-client.test.ts` → all pass

### T2.2 AgentBrowserCliClient 生产实现  [AFK] [dependsOn: [T2.1]]
**Spec**: R1-AC3, R4-AC2（凭据 stdin 非 argv）, R3-AC5（超时）  | **est**: 25 min  | **nature**: infrastructure
- **RED**: `test/agent-browser-cli-client.test.ts`（mock child_process）
  - `open` 调用断言：`execFile` 第一参数 `"agent-browser"`，args 含 `["open","<url>","--session","<id>"]`，**凭据在 input/stdin 不在 args**。
  - 超时：`open` 给 15000ms，fake clock 推进 → reject（Error message 含 "timeout"）。
  - 安全：args 不含 `password=`/`secret=` 字面量（grep 断言）。
- **GREEN** (MODIFY `src/agent-browser-client.ts`): 加 `AgentBrowserCliClient` 实现。纯函数 `buildOpenArgs(url,sessionId)` → `{executable:"agent-browser",args:[...]}`；`execFile` + `Promise.race(timeout)`。凭据经 `{input: secretPipe}` 选项传 stdin。
- **Verify**: `npx vitest run test/agent-browser-cli-client.test.ts` → all pass

### T2.3 agentBrowserRunner  [AFK] [dependsOn: [T1.2, T2.1]]
**Spec**: R1-AC1, R1-AC2, R1-AC3, R1-AC4, R3-AC6（session）  | **est**: 30 min  | **nature**: vertical-slice（端到端 UI 验收切片）
- **RED**: `test/accept-driver-agent-browser.test.ts`（注入 FakeAgentBrowserClient）
  - happy-path: scenario type=ui，Fake 按序返回 snapshot，断言 run 调用 open→snapshot→fill→click→snapshot，返回 `ScenarioArtifact{verdict:"PASS", evidence:{screenshotPath}}`。
  - refs 失效：Fake.click 第一次 reject("stale")，第二次 ok（re-snapshot 后）→ PASS（重试 1 次内）。
  - refs 两次失效 → `"FAIL"`。
  - 超时（Fake.open hang）→ `"INCONCLUSIVE"`（非 FAIL）。
  - supports: type=ui → true；type=api → false。
- **GREEN** (MODIFY `src/accept-driver.ts`): 删 `uiRunner`，加 `agentBrowserRunner`（实现 Runner 接口）；`RUNNERS` 数组用 `agentBrowserRunner` 替换 `uiRunner`。每 scenario 生成唯一 sessionId（`crypto.randomUUID()`）。act = exec + re-snapshot 原子组合。wall-clock 90s 总超时。
- **Verify**: `npx vitest run test/accept-driver-agent-browser.test.ts` → all pass

---

## Wave 3 — ui-harness Tier 替换与降级链

### T3.1 ui-harness Tier 替换 agent-browser  [AFK] [dependsOn: [T2.1]]
**Spec**: R3-AC1, R3-AC2, R3-AC3, R3-AC4  | **est**: 20 min  | **nature**: infrastructure
- **RED**: 扩展 `test/ui-harness-tier-selection.test.ts`
  - tier 顺序断言：project → agent-browser → playwright → cdp。
  - `cmux-browser` 不再出现在 `UiControllerTier` 类型与 attempted 记录。
  - `detectAgentBrowser()` mock 返回 false → attempted 记 `{tier:"agent-browser",reason:"not installed"}`，降级到 playwright。
- **GREEN** (MODIFY `src/ui-harness.ts`): `UiControllerTier` 删 `"cmux-browser"` 加 `"agent-browser"`；删 cmux tier 分支，加 agent-browser tier 分支；实现 `detectAgentBrowser()`（`which`/npm bin 探测，缺失返回 false 不抛错）。
- **Verify**: `npx vitest run test/ui-harness-tier-selection.test.ts` → all pass

### T3.2 修复 execCommand stub（api/cli runner）  [AFK] [dependsOn: []]
**Spec**: 修复现状 bug（非新需求，支撑 R1 完整性）  | **est**: 18 min  | **nature**: infrastructure
- **RED**: `test/accept-driver-exec.test.ts`（mock execFile）
  - apiRunner 给定 endpoint `POST /api/login`，断言真执行 execFile（非假 200），返回真实 stdout。
  - http_code 200 预期但实际 401 → `"FAIL"`。
  - 命令执行 reject → `"INCONCLUSIVE"`。
- **GREEN** (MODIFY `src/accept-driver.ts`): 实现 `execCommand` 用 `execFile`（纯函数 `buildCurlArgs`/`buildCliArgs` 描述符），删 placeholder `return {stdout:"200"}`。api/cli runner 的 `evaluateApiVerdict`/`evaluateCliVerdict` 已有，接真结果。
- **Verify**: `npx vitest run test/accept-driver-exec.test.ts` → all pass

---

## Wave 4 — 安全、报告与配置

### T4.1 .gitignore + config pin  [AFK] [dependsOn: []]
**Spec**: R4-AC3, R4-AC6  | **est**: 5 min  | **nature**: infrastructure
- **RED/Verify**: `test/accept-config.test.ts`
  - 读 `.gitignore`，断言含 `.tinkerman/acceptance/` 行。
  - 读 `.tinkerman/config.md`，断言含 `agent_browser_pin_sha256:` 字段（值非空）。
- **GREEN** (MODIFY `.gitignore`, `.tinkerman/config.md`): 加 `.tinkerman/acceptance/`；加 `agent_browser_pin_sha256: "<TBD-by-releaser>"` 字段（releaser 发布时填实际 SHA）。
- **Verify**: `npx vitest run test/accept-config.test.ts` → pass

### T4.2 报告三态呈现  [AFK] [dependsOn: [T1.1]]
**Spec**: R5-AC1..AC6  | **est**: 22 min  | **nature**: vertical-slice（报告切片）
- **RED**: `test/acceptance-report.test.ts`
  - PASS 场景渲染为单行 `✅ <id> — PASS`。
  - FAIL 场景渲染含 `❌` + Given/When/Then 原文 + 未满足 Then 高亮（`**Then** ...`）+ `<details>` snapshot 块 + `Next →` 提示。
  - INCONCLUSIVE 场景渲染含 `⚠️` + 固定后缀"这不是失败——是当前环境无法验证，不阻断 ship"。
  - summary 表含 `INCONCLUSIVE` 行 + `Blocks Ship: YES/NO` + `Run: N/M scenarios`。
- **GREEN** (MODIFY `src/accept-driver.ts` `renderAcceptanceReport`): 按 AC 实现。
- **Verify**: `npx vitest run test/acceptance-report.test.ts` → pass

### T4.3 占位符凭据解析（stdin 传递）  [AFK] [dependsOn: [T2.2]]
**Spec**: R4-AC1, R4-AC2  | **est**: 15 min  | **nature**: vertical-slice（安全+执行切片）
- **RED**: `test/accept-credentials.test.ts`
  - scenario Given 含 `{{FORGE_E2E_PASSWORD}}`，process.env 设 `FORGE_E2E_PASSWORD=secret123`。
  - 断言 runner 解析占位符为 `secret123`，经 AgentBrowserClient.fill 的 value 传入；CliClient 调用 args **不含** `secret123`（grep args 断言），input（stdin）含。
  - 缺 env 变量 → `"INCONCLUSIVE"`（reason: "missing secret FORGE_E2E_PASSWORD"），不抛错。
- **GREEN** (CREATE `src/accept-credentials.ts` + 接入 runner): `resolvePlaceholder(value, env)` 纯函数；runner 在 fill 前解析。CliClient.fill 的 value 经 stdin（复用 T2.2 的 input 通道）。
- **Verify**: `npx vitest run test/accept-credentials.test.ts` → pass

---

## Wave 5 — 契约测试与文档

### T5.1 @smoke 契约测试  [HITL] [dependsOn: [T2.3, T3.1]]
**Spec**: 全链路验证  | **est**: 30 min  | **nature**: infrastructure（需真实 agent-browser）
- **RED**: `test/smoke/accept-login.smoke.test.ts`（标 `@smoke`，CI optional）
  - fixture: 一个最小静态登录 HTML（`test/fixtures/login.html`，form action 跳转到 welcome.html）+ 本地 http server。
  - 真实 agent-browser：open → fill admin/secret → click 登录 → snapshot → 断言 `verdict:"PASS"`、跳转到 welcome。
- **GREEN**: 配套 fixture + 跳过逻辑（无 agent-browser 时 test.skip，不 fail）。
- **Verify**: `npx vitest run --testNamePattern smoke test/smoke/`（本地有 agent-browser 时）→ pass；CI 无则 skip。
- **HITL 理由**: 需真实 agent-browser 环境，执行前确认本机可用。

### T5.2 更新 accept SKILL instructions  [AFK] [dependsOn: [T2.3, T3.1]]
**Spec**: 文档同步  | **est**: 10 min  | **nature**: infrastructure
- **GREEN** (MODIFY `skills/forge/lib/accept/instructions.md` Step 3): UI 分支描述从 "cmux browser + axe-core" 改为 "agent-browser（snapshot+refs）；前置：用户需装 agent-browser 或环境自带"。新增「三态判定」说明段落。
- **Verify**: manual（读改后文档确认与代码一致）

### T5.3 用户 onboarding 文档  [AFK] [dependsOn: []]
**Spec**: 降低采用门槛  | **est**: 12 min  | **nature**: infrastructure
- **GREEN** (CREATE `docs/acceptance-onboarding.md`): 三条硬约束（装 agent-browser / 起 dev server / 占位符凭据走 .tinkerman/secrets.env）+ 命令示例 `/forge accept` + 与 `/forge review` 区分表。
- **Verify**: manual

---

## Execution Packages（14 任务 ≥10，按 Wave/依赖聚合）

| Package | 含任务 | depends_on_packages | 说明 |
|---|---|---|---|
| **P1 类型与纯函数** | T1.1, T1.2, T1.3 | — | 无依赖，可全并行 |
| **P2 Client 与 Runner** | T2.1, T2.2, T2.3 | P1 | T2.3 依赖 T1.2 |
| **P3 Harness 与 Exec** | T3.1, T3.2 | P2 (T3.1), — (T3.2) | |
| **P4 安全报告配置** | T4.1, T4.2, T4.3 | P1(T4.2), P2(T4.3), — (T4.1) | |
| **P5 契约与文档** | T5.1, T5.2, T5.3 | P2+P3 (T5.1), P2+P3 (T5.2), — (T5.3) | |

---

## Dependency Graph（拓扑序，无循环）

```
T1.1 ─┬─→ T4.2
T1.2 ─┴─→ T2.3 ──→ T5.1, T5.2
T1.3 (indep)
T2.1 ──→ T2.2 ──→ T4.3
T2.1 ──→ T3.1 ──→ T5.1, T5.2
T3.2 (indep)
T4.1 (indep)
T5.3 (indep)
```
`validateGraph`：无环，拓扑有效。

---

## Definition of Done

- [ ] Wave 1-5 全部任务 RED→GREEN→REFACTOR，证据保留在 test/ 下。
- [ ] `npm test` 全绿（含新增测试，@smoke 可 skip）。
- [ ] `npm run typecheck`（或 `npx tsc --noEmit`）零 error。
- [ ] `npm run lint` 无新增 error。
- [ ] 至少 1 个 @smoke 契约测试本地跑通真实 agent-browser（HITL 确认）。
- [ ] Forge `package.json` 无新增 runtime 依赖（grep `dependencies` 确认 [R6.5]）。
- [ ] 决策文档 + 三文件 spec status=locked。
- [ ] commit-log 含 T1.1...T5.3 原子提交。

## Risk Register（来自 decide Critic）

| 风险 | 级别 | 对应任务 |
|---|---|---|
| agentic 不可复现 | 高 | T2.3（确定性步骤+证据）、T5.1（smoke 验证） |
| argv 传密 | P0 | T2.2、T4.3（stdin 强制） |
| refs 失效 | 中 | T2.3（act+re-snapshot 原子、重试1次） |
| agent-browser 未装 | 中 | T3.1（detectAgentBrowser 降级） |
| 供应链投毒 | P1 | T4.1（SHA256 pin） |
