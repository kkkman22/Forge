---
status: locked
feature: agentic-acceptance
layout: requirements
created: 2026-06-17
tier: full
decision_ref: .tinkerman/decisions/2026-06-17-agentic-acceptance-with-agent-browser.md
---

# Requirements Document — Agentic Acceptance

## Introduction

Forge 的 `/forge accept` 命令（`skills/forge/lib/accept/instructions.md`）已定义「从 spec 解析验收场景 → 分发 runner → 聚合 PASS/FAIL → 可阻断 ship」的完整骨架，其解析层 `src/accept.ts` 是成熟纯函数。但**执行层 `src/accept-driver.ts` 全是 stub**：UI 场景的 `uiRunner` 永远返回 SKIP，API/CLI 场景的 `execCommand` 假返回 200。

结果是：终端用户（marketplace 分发）用 Forge 开发出一个功能（如 SaaS 登录）后，跑 `/forge accept` 得不到任何真实的验收结论——spec 里写了完整的 Given/When/Then 登录场景，却只会 SKIP。

本 spec 将 `/forge accept` 的 UI 执行层接通 Vercel agent-browser（snapshot+refs 机制，比 chrome-devtools MCP 省 82-90% token，环境已装），让用户跑一条命令就能端到端验收 Web 功能是否真正可用。

**明确不做**（非目标）：
- 不新建命令（增强现有 `/forge accept`）。
- 不做 mixed runner（API+UI 混合）。
- 不做自愈式自动修复重试（产品决策：结论可信 >> 覆盖率；确定性步骤优先）。
- 不做多账号矩阵/跨浏览器。
- 不动链路 B（`/forge review` Layer4 frontend-check 质量审计）。
- 不用 chrome-devtools MCP 作验收底座（留链路 B Tier C 性能用）。
- 不引入 Python/任何浏览器依赖进 Forge package.json（宪法 [R6.5]）。

## Glossary

| 术语 | 定义 |
|---|---|
| **agent-browser** | Vercel 出品的 Rust CLI/SKILL，通过 Bash 调用，snapshot 返回可交互元素 + 确定性 ref 引用，agent 按 ref 操作 |
| **snapshot+refs** | agent-browser 的核心机制：snapshot 只返回可交互元素（非整页 a11y tree）并分配 `ref="e3"`，agent 按 ref 点击/填写，token 消耗降 82-90% |
| **三态判定** | PASS / FAIL(blocksShip) / INCONCLUSIVE(环境不可用，不阻断) — 区别于现状的 PASS/FAIL/SKIP/WARN |
| **Runner** | accept-driver.ts 中实现 `supports(scenario)/run(scenario,ctx)` 接口的执行器，按 scenario.type 分发 |
| **Tier** | ui-harness.ts 的执行底座降级链：project(e2e快车道) → agent-browser → playwright → cdp |

## Requirements

### Requirement 1: Agent-browser Runner 接通 UI 场景执行

**User Story:** 作为终端用户，我跑 `/forge accept` 验收登录功能时，系统真正打开浏览器、按 spec 场景操作、产出 PASS/FAIL，而不是 SKIP。

#### Acceptance Criteria

1. THE system SHALL provide a new runner `agentBrowserRunner` implementing the existing Runner interface (`supports(scenario)` / `run(scenario, ctx)` → `ScenarioArtifact`) in `src/accept-driver.ts`.
2. `agentBrowserRunner` SHALL `supports` any scenario whose classified `type === "ui"`.
3. `agentBrowserRunner.run` SHALL drive agent-browser via `child_process` (Bash) using: `agent-browser open <url> --session <id>` → `agent-browser snapshot` → parse refs → `agent-browser click/fill` by ref → `agent-browser snapshot` (re-snapshot after each act) → assert Then clause.
4. THE stale `uiRunner` (always returns SKIP) SHALL be removed; its responsibility SHALL be taken over by `agentBrowserRunner`.
5. VERIFY scenario Then-clause SHALL be performed by a pure function `evaluateUiVerdict(snapshot, thenClause)` that returns `PASS | FAIL` based on snapshot text/URL/title matching the Then assertion.

> Verify-By: vitest (pure functions: evaluateUiVerdict, runner.dispatch), forge_exec (Bash boundary: AgentBrowserClient.exec)
> Evidence: test/accept-driver.test.ts, test/evaluate-ui-verdict.test.ts

### Requirement 2: 三态判定与 INCONCLUSIVE 语义

**User Story:** 作为终端用户，当 agent-browser 没装或崩溃时，我看到的是「环境无法验证」（不是失败），不被错误地阻断 ship。

#### Acceptance Criteria

1. THE verdict enum SHALL be extended to `PASS | FAIL | SKIP | WARN | INCONCLUSIVE`.
2. WHEN a runner cannot execute due to environment unavailability (agent-browser not installed, dev server not running, browser crash/timeout), it SHALL return `INCONCLUSIVE` (NOT `FAIL`, NOT `SKIP`).
3. `aggregateVerdicts(artifacts)` SHALL compute `blocksShip = (fail > 0)` — INCONCLUSIVE SHALL NOT increment `fail` and SHALL NOT block ship.
4. `aggregateVerdicts` SHALL report an independent `inconclusive` count in its summary.
5. WHEN the whole tier chain yields no usable result, the run verdict SHALL be `INCONCLUSIVE` (three-state), never silently `PASS`.

> Verify-By: vitest
> Evidence: test/aggregate-verdicts.test.ts (cases: all-PASS, one-FAIL-blocks, all-INCONCLUSIVE-not-blocks, mixed)

### Requirement 3: Tier 降级链（agent-browser 替换 cmux-browser）

**User Story:** 作为终端用户，我的环境有什么浏览器工具，Forge 就用什么，按最优成本顺序尝试。

#### Acceptance Criteria

1. `runUiHarness` (src/ui-harness.ts) SHALL use this tier order: `project` → `agent-browser` → `playwright` → `cdp` → `INCONCLUSIVE`.
2. THE existing `cmux-browser` Tier 2 SHALL be removed (it returns `false` unimplemented; superseded by agent-browser).
3. Tier 1 `project` SHALL detect `playwright.config.*` / `cypress.config.*` and, when present, delegate to the user's existing e2e as the zero-token fast lane (deterministic, highest confidence).
4. Tier `agent-browser` SHALL be selected via `detectAgentBrowser()` (probe `which agent-browser` / npm bin). Unavailable → fall through to next tier, never FAIL.
5. EACH agent-browser action SHALL carry a timeout: open 15s / snapshot 10s / click 5s; whole scenario wall-clock limit 90s. Timeout SHALL yield INCONCLUSIVE.
6. agent-browser refs SHALL be scoped to a single session (`--session <id>`); each scenario SHALL get its own session id.

> Verify-By: vitest (fake tier detectors), forge_exec (@smoke contract test)
> Evidence: test/ui-harness-tier-selection.test.ts (extend with agent-browser tier)

### Requirement 4: 凭据与证据安全基线（P0/P1）

**User Story:** 作为终端用户，我不用担心测试密码或截图泄露进 git。

#### Acceptance Criteria

1. SPEC scenario Given clauses SHALL use placeholders (`{{FORGE_E2E_PASSWORD}}`); the runner SHALL resolve placeholders from environment / `.tinkerman/secrets.env` (mode 0600, already gitignored) at runtime.
2. CREDENTIALS SHALL NEVER be passed via command-line argv to agent-browser; they SHALL be delivered via stdin or a 0600 temp file deleted after use.
   > **Deviation (2026-06-17, post-smoke):** The real agent-browser v0.28 CLI `fill` command has NO stdin/file option — the value is a positional argv argument (verified via `fill --help` and end-to-end smoke). R4-AC2 is downgraded to **best-effort**: credentials appear in argv of a short-lived process (≤5s), acceptance runs against local dev only, and the residual risk (ps/process-list visibility) is documented in the ADR and onboarding guide. This deviation holds until agent-browser adds a stdin channel.
3. THE evidence directories `.tinkerman/acceptance/`, `.tinkerman/acceptance/**` SHALL be added to `.gitignore`.
4. SNAPSHOT text SHALL be redacted before persistence: regex-strip `cookie`/`set-cookie`/`authorization`/`bearer`/`token`/`password` headers and `http://192.168.*` / `http://*.local` / `localhost:port` from the persisted artifact.
5. URL allowlist: the runner SHALL only navigate to `localhost` / `127.0.0.1` plus any dev domain explicitly declared in the scenario/spec; navigation outside the allowlist SHALL abort the scenario as INCONCLUSIVE.
6. agent-browser version SHALL be pinned by SHA256 in `.tinkerman/config.md`; unpinned/auto-upgrade SHALL be refused.

> Verify-By: vitest (redaction regex, allowlist check), bash (gitignore contains patterns, secrets.env perms)
> Evidence: test/accept-security.test.ts, scripts/check-accept-security.sh

### Requirement 5: 验收报告 UX（三态呈现 + 证据折叠 + 失败可操作性）

**User Story:** 作为终端用户，我能快速看懂验收结论，FAIL 时知道下一步干什么。

#### Acceptance Criteria

1. `renderAcceptanceReport` SHALL render distinct visual markers: PASS ✅ / FAIL ❌ / INCONCLUSIVE ⚠️ (grey, with fixed suffix "这不是失败——是当前环境无法验证，不阻断 ship").
2. FAIL scenarios SHALL render the Given/When/Then original text with the unsatisfied Then clause highlighted.
3. PASS scenarios SHALL collapse to a single line; FAIL/INCONCLUSIVE SHALL expand with a `<details>` block containing snapshot text + screenshot relative path.
4. EACH FAIL scenario SHALL append a `Next →` heuristic hint (template per scenario type: UI jump-not-occurred → "查路由守卫/鉴权返回"; assertion-mismatch → "核对 Then 预期与实际 snapshot 差异").
5. THE report header SHALL show `Run: N/M scenarios (K hidden, --all to show)` explaining partial selection, and a `Blocks Ship: YES/NO` line.
6. THE summary table SHALL include an `INCONCLUSIVE` count row.

> Verify-By: vitest (renderAcceptanceReport snapshot)
> Evidence: test/acceptance-report.test.ts

## Charter 合规性
（本特性为 Forge 自身工具增强，无外部 charter invariant 冲突。决策文档已记录 Critic 审查。）

## Anti-drift
- **主目标**：让 `/forge accept` 的 UI 场景真正跑出 PASS/FAIL。
- **非目标代理信号**：覆盖率数字（本特性以「结论可信」为先，不为追求高覆盖率牺牲确定性）。
- **验证材料角色**：spec 的 Given/When/Then 是验收唯一真理源；agent-browser 是执行手段不是真理源。
