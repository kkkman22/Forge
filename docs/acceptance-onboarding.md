---
title: 'Acceptance Verification — Onboarding'
category: reference
audience:
- daily-developer
- contributor
updated: 2026-06-17
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# Acceptance Verification Onboarding

> How to use Forge's `/forge accept` to automatically verify a feature (e.g. a SaaS login) end-to-end.

## What `/forge accept` does

Runs your spec's acceptance scenarios (Given/When/Then) against the **real running system** and reports **PASS / FAIL / INCONCLUSIVE**. A FAIL blocks `/forge ship`. This is **behavioral verification** — distinct from `/forge review` (code-quality audit) and `/forge test` (unit/integration).

| Command | Answers | Blocks ship? |
|---|---|---|
| `/forge accept` | "Does the feature actually work end-to-end?" | YES on FAIL |
| `/forge review` | "Is the code quality up to standard?" | YES on P0/P1 |
| `/forge test` | "Do units/integrations pass?" | YES on fail |

## Three prerequisites (hard constraints)

1. **Install agent-browser** (Vercel, snapshot+refs CLI):
   ```bash
   npm i -g @vercel-labs/agent-browser   # or per its install docs
   which agent-browser                    # must resolve
   ```
   Forge does NOT bundle any browser dependency (constitution R6.5). If absent, UI scenarios report INCONCLUSIVE (no false PASS).

2. **Start your dev server** before running:
   ```bash
   npm run dev   # must serve the page the scenarios navigate to
   ```

3. **Use placeholder credentials, never hardcode secrets**:
   ```markdown
   ## Scenarios
   @critical
   Scenario: 用户登录
     Given 登录页 /login 已打开，用户名 {{FORGE_E2E_USER}}，密码 {{FORGE_E2E_PASSWORD}}
     When 点击 登录按钮
     Then 跳转 /dashboard 且 显示 欢迎
   ```
   Provide values via env (or `.forge/secrets.env`, mode 0600, gitignored):
   ```bash
   export FORGE_E2E_USER=admin
   export FORGE_E2E_PASSWORD=your-test-password
   ```
   Secrets flow to agent-browser via **stdin, never argv** (R4-AC2). Evidence (screenshots/snapshots) is redacted and gitignored (R4-AC3/AC4).

## Run it

```bash
/forge accept
```

Report lands at `.forge/acceptance/<topic>/report.md`. Example summary:

```
Run: 3/3 scenarios
| PASS          | 2 |
| FAIL          | 1 |
| INCONCLUSIVE  | 0 |
Blocks Ship: YES

❌ login-happy — FAIL
Then 跳转 /dashboard 且 显示 欢迎
- Reason: THEN not satisfied: 跳转 /dashboard
- Next → UI 跳转未发生，检查路由守卫/鉴权返回。
```

## Tier fallback (cost control)

`/forge accept` picks the cheapest tier that works:

1. **Your own e2e** (`playwright.config.*` present) → runs it directly, near-zero agent token cost.
2. **agent-browser** (snapshot+refs) → ~1.4–2.5K tokens/snapshot, 82–90% cheaper than chrome-devtools MCP.
3. **playwright (guarded import)** → screenshot fallback.
4. **cdp** → connectivity probe.
5. All fail → **INCONCLUSIVE**.

## Token economy

A single scenario (≤5 snapshots) targets **≤15K tokens**. agent-browser returns only interactive element refs (not the full accessibility tree). If a page is too complex, the harness emits a WARN suggesting Playwright e2e instead.

## vs browser-harness / chrome-devtools MCP

Forge deliberately uses agent-browser (not chrome-devtools MCP) for acceptance because:
- chrome-devtools MCP returns the full page a11y tree (~17K tokens/page — "token hell").
- browser-harness (Python) adds a cross-language runtime; its self-healing targets "complete any task," not "reproducible PASS/FAIL assertions."

Acceptance prioritizes **reproducible verdicts over coverage**, so the deterministic snapshot+refs model fits better than LLM-rewrites-the-helper self-healing.
