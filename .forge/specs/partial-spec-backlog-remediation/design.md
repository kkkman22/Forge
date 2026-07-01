---
feature: partial-spec-backlog-remediation
layout: design
created: 2026-06-07
---

# Design — Partial Spec Backlog Remediation

## 架构原则

本 spec 是“审计复核后的收口修复”，不是旧架构恢复。设计重点是把已经存在但未接线的脚本接入当前 manifest，并用小测试保护核心恢复/清理路径。

## Workstreams

### W1: Hook Manifest Remediation

事实源：

- Source manifest: `hooks/hooks.json`
- Distributed manifest: `dist-plugin/hooks/hooks.json`
- Scripts: `scripts/config-changed-hook.mjs`, `scripts/permission-denied-hook.mjs`, `scripts/worktree-remove-hook.mjs`

设计：

1. 在 source/dist 两个 manifest 中新增 `ConfigChange`、`PermissionDenied`、`WorktreeRemove`。
2. 新增项一律使用 `args` 数组，不引入 shell fallback。
3. 保留已有 `TaskCreated`、`WorktreeCreate`、`StopFailure` 注册。
4. Contract test 读取两个 manifest，断言 lifecycle event 和脚本路径一致。

不做：

- 不恢复 `.claude-plugin/plugin.json`。
- 不一次性重写所有 `command` hook；保留带多路径 fallback 的 inline shell。
- 不引入 `mcp_tool` hook，除非有现成 MCP server/tool contract。

### W2: Cleanup Timeout

目标函数：`src/cleanup-chain.ts::runCleanupChain`

设计：

```ts
execFileSync("git", ["worktree", "remove", ctx.worktreePath], {
  stdio: "pipe",
  timeout: 30000,
  killSignal: "SIGTERM",
});
```

测试策略：

- 优先用 mock/spying 方式验证 `execFileSync` options。
- 如果现有测试结构不易 mock built-in import，则用 source-level regression test 检查 `timeout: 30000` 和 `killSignal` 同时存在。
- 保持 cleanup chain 捕获异常并写 `cleanup-errors.jsonl` 的行为。

### W3: Resume Regression Coverage

目标文件：`skills/forge/lib/resume/instructions.md`

测试关注点：

- instruction 必须读取 `.forge/status.md` 或 `.forge/status/`。
- instruction 必须读取 `.forge/progress/`。
- instruction 必须说明根据 phase 恢复下一动作。
- review/test/ship 这类中后段 phase 不能被重置到 plan/build。

该测试不模拟 Claude agent，只保护本项目的 resume contract 文档不漂移。

### W4: Superseded Documentation

更新 `.forge/docs/partial-spec-satisfaction.md`，把旧报告中的过期项显式降级：

- `structured-observability`: SDK/loop driver removed; do not wire old CLI flags.
- `ship-delivery-unification`: git transaction/effect layer removed; do not restore in this spec.
- `cmux-integration`: loop producer requirements reference removed `src/sdk-driver.ts`; do not chase old events.
- `pms-pack-v1`: glossary is already context-split; old flat-structure finding is invalid.
- `conflict-resolver-hook`: ship documentation and tests already reference conflict resolver; do not duplicate old integration claim.

## Dependency Graph

```text
W4 docs update ───────────────┐
W1 hook manifest ──┐          │
W2 cleanup timeout ├── tests ─┼── spec index/check
W3 resume tests ───┘          │
```

W4 can land independently. W1 touches source and dist plugin manifests together. W2 and W3 are isolated.

## Risk Controls

| Risk | Control |
|------|---------|
| Hook event unsupported on some Claude Code versions | Hook entries are fail-open scripts; missing event support means no trigger, no runtime break. |
| Dist/source manifest drift | Edit both manifests in same task and add contract assertion. |
| Over-migrating hooks breaks fallback semantics | Only new/low-risk entries use `args`; fallback-heavy commands remain unchanged. |
| Resume test becomes too textual | Assert stable contract phrases/paths, not full document content. |
| Old spec restoration creeps into scope | Requirements explicitly forbid restoring removed loop/delivery modules. |

## Verification Strategy

Focused:

```bash
npx vitest run test/config-changed-hook.test.ts test/contract.test.ts
npx vitest run test/hooks/permission-denied-hook.test.mjs test/hooks/worktree-hooks.test.mjs
npx vitest run test/cleanup-chain.test.ts
npx vitest run test/forge-resume/resume-phase-coverage.test.ts
```

Final:

```bash
npx tsc --noEmit
npm run check
node scripts/rebuild-spec-index.mjs --check
```
