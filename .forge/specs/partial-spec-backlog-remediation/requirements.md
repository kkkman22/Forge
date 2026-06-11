---
status: completed
feature: partial-spec-backlog-remediation
layout: requirements
created: 2026-06-07
tier: standard
source: ".forge/docs/partial-spec-satisfaction.md"
---

# Requirements — Partial Spec Backlog Remediation

## 目标

修复 `.forge/docs/partial-spec-satisfaction.md` 复核后仍值得做的确定性缺口：补齐当前 hook manifest 注册、给 cleanup git 操作增加超时、补 resume 阶段回归测试，并把已被当前架构替代的旧 spec 状态文档化，避免后续按过期审计误修。

## 非目标

- 不恢复已删除的 `forge-loop-cli.ts`、`src/sdk-driver.ts`、`src/git-transaction.ts` 或旧 delivery effects。
- 不重新实现完整 Event Sourcing、structured observability CLI、cmux loop producer。
- 不创建新的 archive skill，除非已有公开命令入口需要绑定。
- 不做大规模 hook manifest 重写；本轮只迁移/注册确定性高的 hook。

---

## REQ-01: 注册 ConfigChange hook

**User Story:** 作为 Forge 用户，我希望修改 `.forge/config.md` 后已有的 `config-changed-hook.mjs` 能通过当前 hook manifest 触发，而不是只停留在脚本和测试中。

### Acceptance Criteria

1. WHEN `hooks/hooks.json` 被解析 THEN `hooks.ConfigChange` SHALL 存在。
2. THE `ConfigChange` hook SHALL 使用 `args: ["node", "scripts/config-changed-hook.mjs"]`，timeout SHALL 为 3 秒。
3. THE same registration SHALL exist in `dist-plugin/hooks/hooks.json`.
4. THE registration SHALL NOT refer to removed `.claude-plugin/plugin.json`.
5. WHEN `test/config-changed-hook.test.ts` runs THEN existing behavior tests SHALL still pass.

**Verify-By**: `npx vitest run test/config-changed-hook.test.ts test/contract.test.ts`

---

## REQ-02: 补齐缺失生命周期 hook 注册

**User Story:** 作为 Forge 维护者，我希望 `hook-system-enhancement` 中已经存在的生命周期脚本都能被当前 hook manifest 消费，避免“脚本存在但永不触发”。

### Acceptance Criteria

1. WHEN `hooks/hooks.json` 被解析 THEN `hooks.PermissionDenied` SHALL exist and invoke `scripts/permission-denied-hook.mjs` via `args`.
2. WHEN `hooks/hooks.json` 被解析 THEN `hooks.WorktreeRemove` SHALL exist and invoke `scripts/worktree-remove-hook.mjs` via `args`.
3. THE same two event registrations SHALL exist in `dist-plugin/hooks/hooks.json`.
4. Existing registered events `TaskCreated`, `WorktreeCreate`, and `StopFailure` SHALL remain registered.
5. A contract test SHALL assert the expected lifecycle events are present in both source and dist-plugin manifests.

**Verify-By**: `npx vitest run test/contract.test.ts test/hooks/permission-denied-hook.test.mjs test/hooks/worktree-hooks.test.mjs`

---

## REQ-03: 降低 hook command 字符串漂移风险

**User Story:** 作为 Forge 维护者，我希望新注册和低风险 hook 使用 `args` 数组，避免 shell quoting 和不存在脚本路径导致的漂移。

### Acceptance Criteria

1. New registrations from REQ-01 and REQ-02 SHALL use `args`, not `command`.
2. Existing `TaskCompleted` registration SHOULD be migrated to `args: ["bash", "scripts/hook-task-completed.sh"]` if fallback path semantics are not required.
3. Inline shell hooks with real fallback behavior MAY remain as `command`; this spec SHALL NOT require full manifest rewrite.
4. A manifest metric in the updated doc SHALL record current `command` / `args` counts after implementation.

**Verify-By**: `node -e` manifest count or contract test assertion.

---

## REQ-04: cleanup-chain git worktree remove 超时

**User Story:** 作为 Forge 用户，我希望 cleanup 阶段的 git worktree remove 不会无限阻塞，从而拖死进程清理链。

### Acceptance Criteria

1. WHEN `runCleanupChain()` removes a worktree THEN `execFileSync("git", ["worktree", "remove", path], options)` SHALL include `timeout: 30000`.
2. THE same call SHOULD include `killSignal: "SIGTERM"`.
3. Existing cleanup error downgrade behavior SHALL remain: failures are captured into `cleanup-errors.jsonl` and do not throw out of the cleanup chain.
4. A regression test SHALL assert timeout behavior without requiring a real long-running git process.

**Verify-By**: `npx vitest run test/cleanup-chain.test.ts`

---

## REQ-05: resume phase coverage 回归测试

**User Story:** 作为 Forge 用户，我希望上下文压缩或新会话恢复后，`/forge resume` 不会丢失当前 phase 的后续步骤和自动推进义务。

### Acceptance Criteria

1. A new focused test SHALL cover resuming from a status/progress fixture where phase is `review`, `test`, or `ship`.
2. THE test SHALL assert the resume instructions preserve the current phase and next required action.
3. THE test SHALL use local fixtures and SHALL NOT require external Claude/Agent execution.
4. THE test SHALL fail if `skills/forge/lib/resume/instructions.md` no longer mentions reading `.forge/status.md` and `.forge/progress/`.

**Verify-By**: `npx vitest run test/forge-resume/resume-phase-coverage.test.ts`

---

## REQ-06: Superseded specs 文档化

**User Story:** 作为 Forge 维护者，我希望已被当前架构替代的旧 spec 被明确标记，避免后续 agent 根据旧审计恢复已删除架构。

### Acceptance Criteria

1. `.forge/docs/partial-spec-satisfaction.md` SHALL list `structured-observability`, `ship-delivery-unification`, `cmux-integration` loop producer, and `pms-pack-v1` as superseded/过期 where applicable.
2. The document SHALL include current evidence for `pms-pack-v1` glossary context files.
3. The document SHALL explicitly say not to restore `src/sdk-driver.ts`, `forge-loop-cli.ts`, or `src/git-transaction.ts` under this remediation.
4. A docs check or grep SHALL verify the superseded section exists.

**Verify-By**: `rg "Superseded|不恢复|pms-pack-v1" .forge/docs/partial-spec-satisfaction.md`

---

## Completion Gates

- `npx tsc --noEmit`
- Focused vitest commands listed above
- `npm run check` when scope touches dist/plugin manifests or global contracts
- `node scripts/rebuild-spec-index.mjs --check` after regenerating spec index
