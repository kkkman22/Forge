---
topic: agentic-acceptance-with-agent-browser
date: 2026-06-17
status: accepted
tier: full
supersedes: []
related_specs:
  - .forge/specs/agentic-acceptance/  (to be created)
---

# ADR: 基于 agent-browser 的端到端 Agentic 验收

## Context（背景）

Forge 是 Claude Code/Codex 的 SKILL 插件，经 marketplace 分发给终端用户。用户在自己项目中用 Forge 开发出功能（如 SaaS 登录）后，需要一个「跑一条命令自动验收该功能是否真正可用」的能力——端到端功能验收，非页面质量审计。

### 现状事实（逐行核实）

- **`/forge accept` 命令已存在**（`skills/forge/lib/accept/instructions.md`），定位为「行为验收、跑运行时、可阻断 ship」，输出到 `.forge/acceptance/<topic>/`。与 `/forge verify`（三态证据判定）、`/forge test`（单测）、`/forge review`（质量审计）已明确区分。**本任务是增强现有命令，非新建。**
- 解析层 `src/accept.ts`（315 行）：`parseScenariosFromSpec` / `classifyScenarioType` / `selectScenariosForRun` / `aggregateVerdicts` 均为纯函数，可复用。
- 执行层 `src/accept-driver.ts`（284 行）：`uiRunner`(:60) 永远返回 SKIP；`apiRunner`/`cliRunner` 的 `execCommand`(:281) 是 placeholder 假返回 200；`mixedRunner` 未实现。
- ui-harness 4 tier：Tier1 project（只检测不执行）、Tier2 cmux-browser（`return false` 未实现）、Tier3 playwright（守卫截图）、Tier4 cdp（只取版本号）。
- 链路 B（frontend-check agent）做 WCAG/router 静态规则 + Core Web Vitals，与功能验收正交，**保留不动**。

### 选型调研结论（全网 + 官方仓库核实）

| 底座 | token/操作 | 自愈 | 形态 | 决定 |
|---|---|---|---|---|
| Vercel agent-browser | **省 82-90%**（snapshot+refs，~1.4-2.5K） | ✅ refs 自愈 | Rust CLI/SKILL（环境已装） | ✅ 主底座 |
| 用户项目 Playwright e2e | ~0（纯脚本） | ❌ | 用户自带 | ✅ Tier1 快车道 |
| chrome-devtools MCP | ~17K（token 地狱） | ❌ | MCP | ❌ 不作验收底座（留链路 B Tier C 性能用） |
| browser-harness (Python) | 中 | ✅ 强 | Python skill | ❌ 跨语言、违反轻量原则 |
| browser-harness-js | 中 | ❌ 无自愈 | 库 | ❌ 机制等价 chrome-devtools 但生态弱 |

## Decision（决策）

**以 Vercel agent-browser 为 agentic 验收主底座，增强现有 `/forge accept` 命令的 UI 执行层，复用 accept.ts 解析层，保留链路 B 不动。**

### D1. 复用 vs 重写（采纳 architect）
- **accept.ts 解析层：完全复用，零改动。**
- **accept-driver.ts：新增 `agentBrowserRunner`，删 `uiRunner`（永远 SKIP，职责被接管）。** 保留 apiRunner/cliRunner（修掉 execCommand stub 改真 exec）。
- **Runner 接口**（`supports`/`run`→`ScenarioArtifact`）是正确抽象，新 runner 只挂一个实现。

### D2. Tier 设计 — 方案 A（Design It Twice 采纳）
ui-harness 加 agent-browser tier，**替换未实现的 cmux-browser Tier2**：
```
Tier 1  project    → 用户项目有 playwright.config → 跑 e2e（零 token 快车道，最高可信）
Tier 2  agent-browser → snapshot+refs 自主操作（主底座，省 token）
Tier 3  playwright → Forge 守卫式 import（截图兜底）
Tier 4  cdp        → 探活兜底
全失败 → INCONCLUSIVE
```
删 cmux-browser tier（未实现且被 agent-browser 取代）。

### D3. 入口走 TS 路由，非 SKILL 委托（采纳 architect）
agent-browser 是 Bash CLI，TS 层用 child_process 调用可测、可控超时、能收口 evidence/artifact。SKILL 委托会绕过 accept-driver 的证据收集。

### D4. 三态判定与阻断语义（采纳 designer，修正 architect）
- verdict 扩展为 `PASS | FAIL | SKIP | WARN | INCONCLUSIVE`。
- `blocksShip = fail > 0`（FAIL 阻断，INCONCLUSIVE **不阻断、不计 fail、独立计数**）。
- **理由**（Critic 裁决）：product 论证「结论可信 >> 覆盖率，工具不可用时卡死用户更糟」；designer 拆分 SKIP 语义避免误判。architect 的「INCONCLUSIVE 计入阻断」被否决。

### D5. 凭据与证据安全（采纳 security P0/P1）
- **P0-1 凭据不进 git**：spec 用占位符 `{{FORGE_E2E_PASSWORD}}`，运行时从 `.forge/secrets.env`(0600, 已 gitignore) 注入。新增证据目录 `.forge/acceptance/` 显式加入 `.gitignore`。
- **P0-2 argv 禁密**：凭据走 stdin 或 0600 临时文件（用后即删），绝不入命令行参数（防 ps/history 泄露）。
- **P1-1 证据脱敏**：落盘前正则脱敏 snapshot 文本（cookie/authorization/bearer/token/password/内网 IP）。
- **P1-2 作用域限制**：URL allowlist（默认 localhost/127.0.0.1 + spec 声明 dev 域），操作白名单（click/type/assert，禁 db-migrate/外部导航），每步断言 URL 在 allowlist 内。
- **P1-3 供应链 pin**：agent-browser 版本 SHA256 写入 `.forge/config.md`，禁止自动升级。

### D6. 命令与 UX（采纳 designer）
- **不新建命令，增强 `/forge accept`**（已存在）。
- 三态呈现：PASS ✅ / FAIL ❌ / INCONCLUSIVE ⚠️（灰，附「不是失败，是环境无法验证，不阻断 ship」）。
- 证据折叠：PASS 单行；FAIL 展开 Given/When/Then 原文 + 高亮未满足 Then + `<details>` snapshot + screenshot 路径。
- FAIL 附 `Next →` 启发式提示（UI 跳转未发生→查路由守卫/鉴权）。
- 多场景：Summary 表 + `Blocks Ship: YES/NO`，默认只展开 FAIL/INCONCLUSIVE，`--verbose` 全展开。

## MVP 边界（采纳 product）
- **做**：Web UI 场景（登录/表单/导航 happy-path）；Playwright e2e 快车道；三态判定 + 证据 + blocksShip；凭据/证据安全基线。
- **不做**：mixed runner；自愈式自动修复重试；多账号矩阵/跨浏览器；CLI/API runner 的复杂判定（v1 仅修复 execCommand stub，不做复杂断言）。

## Security — Veto 否决记录
无否决。security 视角全部 P0/P1 已纳入决策 D5。

## Risks
| 风险 | 级别 | 缓解 |
|---|---|---|
| agentic 验收不可复现→信任崩塌 | 高 | D4 不阻断 INCONCLUSIVE + 强制确定性步骤 + 每结论附证据链 |
| agent-browser 跨进程 refs 失效 | 中 | D2 session 化（--session <id>），act=exec+re-snapshot 原子动作 |
| agent-browser 未装/崩溃/超时 | 中 | detectAgentBrowser 探测降级；单步超时(open15s/snap10s/click5s)；场景 90s wall-clock |
| argv 传密泄露 | P0 | D5 P0-2 走 stdin/文件 |
| 供应链投毒 | P1 | D5 P1-3 SHA256 pin |

## Verification（验证标准）
- 解析层单测全绿（已有，不动）。
- 新增 `AgentBrowserClient` 接口，fake client 注入测 runner（测试边界划在 Bash 调用边界）。
- `evaluateUiVerdict(snapshot, thenClause)` 纯函数单测。
- ui-harness 降级链用 fake tier detectors 测（复用 `test/ui-harness-tier-selection.test.ts` 模式）。
- 1 个 `@smoke` 契约测试：真实 agent-browser 跑登录 happy-path。

## Next
→ `/forge spec`：将 D1-D6 落为功能规格 `.forge/specs/agentic-acceptance/`。
