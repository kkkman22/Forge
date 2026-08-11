---
feature: agentic-acceptance
layout: design
created: 2026-06-17
---

# Design Document — Agentic Acceptance

## 1. Architecture（采纳决策 D2 方案 A）

复用现有两层结构，职责不变：
- **`src/accept.ts`**：解析层（纯函数）——**零改动**。已有 `parseScenariosFromSpec` / `classifyScenarioType` / `selectScenariosForRun` / `aggregateVerdicts`。
- **`src/accept-driver.ts`**：场景路由（Runner 接口）——**新增 `agentBrowserRunner`，删 `uiRunner`**。RUNNERS 数组更新。
- **`src/ui-harness.ts`**：执行底座（Tier 降级）——**Tier2 cmux-browser 替换为 agent-browser**，`UiControllerTier` 联合类型更新。

### 数据流

```
/forge accept
  → accept.ts: parseScenariosFromSpec(spec) → Scenario[]  (复用，零改动)
  → classifyScenarioType → selectScenariosForRun → Scenario[] (≤5)
  → accept-driver.runScenario(scenario, ctx):
       scenario.type==="ui" → agentBrowserRunner.run
         → ui-harness.runUiHarness(url, opts):
              Tier1 project: detect playwright.config → delegate user e2e (快车道)
              Tier2 agent-browser: AgentBrowserClient.open/snapshot/click/fill/...
              Tier3 playwright: 守卫截图兜底
              Tier4 cdp: 探活兜底
              → UiHarnessVerdict
         → evaluateUiVerdict(snapshot, thenClause) → PASS|FAIL  (纯函数)
         → 包装为 ScenarioArtifact
       else → apiRunner/cliRunner (修掉 execCommand stub)
  → aggregateVerdicts(artifacts) → blocksShip = fail>0  (INCONCLUSIVE 不计)
  → renderAcceptanceReport → .tinkerman/acceptance/<topic>/report.md
```

## 2. 新增类型与数据模型

### 2.1 verdict 扩展（accept.ts）

```typescript
export type Verdict = "PASS" | "FAIL" | "SKIP" | "WARN" | "INCONCLUSIVE";
```

### 2.2 UiControllerTier 扩展（ui-harness.ts）

```typescript
export type UiControllerTier = "project" | "agent-browser" | "playwright" | "cdp";
// 删除 "cmux-browser"
```

### 2.3 AgentBrowserClient 接口（src/agent-browser-client.ts，新建）

收口所有跨进程调用，是**测试边界**——单测注入 fake，不真起浏览器：

```typescript
export interface SnapshotRef { ref: string; tag: string; text: string; role?: string; }

export interface AgentBrowserClient {
  open(url: string, sessionId: string): Promise<void>;        // agent-browser open <url> --session
  snapshot(sessionId: string): Promise<{ refs: SnapshotRef[]; url: string; title: string; text: string }>;
  click(sessionId: string, ref: string): Promise<void>;       // act = click + 自动 re-snapshot 由上层组合
  fill(sessionId: string, ref: string, value: string): Promise<void>;
  screenshot(sessionId: string, destPath: string): Promise<void>;
  close(sessionId: string): Promise<void>;
}
```

生产实现 `AgentBrowserCliClient` 用 `child_process.execFile`（非 exec，避免 shell 注入），超时用 `Promise.race`。凭据经 stdin 传入（非 argv，见安全 D5）。

### 2.4 AgentBrowserRunner（accept-driver.ts）

```typescript
export const agentBrowserRunner: Runner = {
  supports: (scenario) => scenario.type === "ui",
  run: async (scenario, ctx) => { /* 调用 ui-harness + evaluateUiVerdict */ },
};
```

### 2.5 evaluateUiVerdict（纯函数，src/accept-driver.ts 或新文件）

```typescript
export function evaluateUiVerdict(
  snapshot: { url: string; title: string; text: string },
  thenClause: string,
): "PASS" | "FAIL" { /* 关键词/URL 包含匹配 */ }
```

## 3. 错误处理与失败模式

| 失败模式 | 信号 | 处理 | Verdict |
|---|---|---|---|
| agent-browser 未装 | `detectAgentBrowser()` false | 降级下一 tier | (tier 链决定) |
| open 命令退出码≠0 | stderr 含 "not found"/"connect" | 单步不重试，降级 | INCONCLUSIVE |
| snapshot 返回空 refs | refs.length===0 | 报告"页面无可交互元素" | INCONCLUSIVE |
| click ref 失效 | exit≠0 / "stale" | re-snapshot 重试 1 次，仍失败 | FAIL（refs 找不到=断言失败） |
| 单步超时（open15/snap10/click5s） | Promise.race 超时 | 不重试 | INCONCLUSIVE |
| 场景 wall-clock 90s | 总计时器 | close session，终止 | INCONCLUSIVE |
| 浏览器崩溃 | 进程退出 | close，降级 | INCONCLUSIVE |
| URL 越界 allowlist | 导航前检查 | abort | INCONCLUSIVE |
| Then 断言不匹配 | evaluateUiVerdict=false | 记录证据 | **FAIL** |

**重试哲学**：对齐 `src/loop/three-strike.ts`——每个 act 单步最多重试 1 次（仅对 stale ref），不无限重试，不做「自愈修复再验」。

## 4. Reversibility（回滚）

回滚清单：
1. `git revert` 相关 commit → 恢复 `uiRunner`（return SKIP）+ `cmux-browser` tier。
2. 新增文件（`agent-browser-client.ts` 等）直接删除。
3. `Verdict` 去掉 `INCONCLUSIVE` 成员（向后兼容，旧值不受影响）。
4. `.gitignore` 的 `.tinkerman/acceptance/` 行可保留（无害）。

挂载点清单（改动文件）：
- `src/accept.ts`（Verdict 类型扩展）
- `src/accept-driver.ts`（删 uiRunner，加 agentBrowserRunner，修 execCommand）
- `src/ui-harness.ts`（Tier 替换）
- `src/agent-browser-client.ts`（新增）
- `src/accept-security.ts`（新增，脱敏+allowlist）
- `.gitignore`（证据目录）
- `.tinkerman/config.md`（agent-browser pin 字段）
- 测试文件若干

## 5. Non-Functional Requirements（非功能需求）

### NFR-1 Token 经济性
- 单场景验收（≤5 snapshot）目标 token 消耗 **≤ 15K**（对比 chrome-devtools MCP 单页 ~17K）。
- agent-browser snapshot 默认只取可交互元素，禁用整页 dump。
- 超过 15K 时 ui-harness 发出 WARN（不阻断），提示「页面过复杂，建议改用 Playwright e2e」。

### NFR-2 延迟
- 单场景 wall-clock ≤ 90s（含起 server 时间不计）。
- snapshot 返回 ≤ 10s。

### NFR-3 可测性
- 所有跨进程调用经 `AgentBrowserClient` 接口，测试 100% 可注入 fake。
- 不依赖真实浏览器即可跑全部单测（仅 1 个 @smoke 契约测试需真实 agent-browser）。

### NFR-4 零依赖
- Forge `package.json` 不新增任何 runtime 依赖（宪法 [R6.5]）。agent-browser 是外部 CLI，经 child_process 调用。
- TypeScript 编译无新 error。
