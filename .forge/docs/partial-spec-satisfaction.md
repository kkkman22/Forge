---
description: "Use when assessing which specs are partially implemented and what gaps remain"
updated: 2026-06-07
---

# 部分满足 Spec 清单 —— 复核后的价值判断

> 来源：`.forge/spec-audit-report.md`（2026-06-03）+ 2026-06-07 主 Agent 代码复核
> 范围：原报告中状态为 **部分满足** 的 20 个 spec
> 结论：该清单可作为 backlog 输入，但不能按旧 P0/P1 原样执行。部分结论已被后续重构或修复覆盖。

---

## 总览

| 类别 | 数量 | 说明 |
|------|------|------|
| A — 仍值得修复 | 4 | 缺口仍在当前架构主路径上，修复成本低或能消除误导 |
| B — 条件修复 / 降级修复 | 5 | 需要先确认当前架构入口或只做测试/文档化收口 |
| C — 只做文档归档 | 7 | 主体功能可用或已被重构覆盖，继续补旧实现不划算 |
| D — 已过期 / 不应按旧建议做 | 4 | 原证据已失效，或恢复旧架构成本高于收益 |

---

## A — 仍值得修复（4 个）

### 1. `configchange-hook`

| 项目 | 详情 |
|------|------|
| **当前判断** | 值得做。脚本和测试存在，但事件未注册，功能永远不会触发。 |
| **仍存在的缺口** | `hooks/hooks.json` 与 `dist-plugin/hooks/hooks.json` 无 `ConfigChange` 事件。 |
| **已过期部分** | 原 spec 要求 `.claude-plugin/plugin.json`，但当前仓库没有该文件，hook 事实源已迁移到 `hooks/hooks.json` / `dist-plugin/hooks/hooks.json`。 |
| **证据** | `scripts/config-changed-hook.mjs`、`test/config-changed-hook.test.ts` 存在；`rg ConfigChange hooks dist-plugin/hooks .claude` 只命中测试/文档，不命中注册。 |
| **建议修复** | 按当前 manifest 架构补注册 `ConfigChange`，使用 `args: ["node", "scripts/config-changed-hook.mjs"]`，timeout 3 秒；同步 dist-plugin。 |

### 2. `hook-system-enhancement`

| 项目 | 详情 |
|------|------|
| **当前判断** | 值得做，但旧报告夸大。 |
| **仍存在的缺口** | `PermissionDenied`、`WorktreeRemove` 未注册；hook `command` 字符串仍有 24 个，`args` 迁移未完成；`mcp_tool` 仍为 0。 |
| **已过期部分** | 原报告称 5 个新 hook 全未接线不准确：`TaskCreated`、`WorktreeCreate`、`StopFailure` 已在 `hooks/hooks.json` 和 `dist-plugin/hooks/hooks.json` 注册。 |
| **证据** | `hooks/hooks.json` 当前事件集包含 `TaskCreated`、`WorktreeCreate`、`StopFailure`；不包含 `ConfigChange`、`PermissionDenied`、`WorktreeRemove`。统计：36 hook entries，24 `command`，12 `args`，0 `mcp_tool`。 |
| **建议修复** | 先补缺失生命周期事件；再把高风险/短命令 hook 从 `command` 迁移到 `args`，避免一次性重写所有 inline shell。 |

### 3. `process-lifecycle-management`

| 项目 | 详情 |
|------|------|
| **当前判断** | 值得做。低成本可靠性修复。 |
| **仍存在的缺口** | `src/cleanup-chain.ts:42` 的 `execFileSync("git", ["worktree", "remove", ...])` 没有 30 秒超时。 |
| **证据** | `src/cleanup-chain.ts` 当前调用只设置 `{ stdio: "pipe" }`。 |
| **建议修复** | 增加 `timeout: 30000` 与 `killSignal: "SIGTERM"`，补测试断言源码或 mock exec 参数包含 timeout。 |

### 4. `resume-phase-coverage`

| 项目 | 详情 |
|------|------|
| **当前判断** | 值得做。属于核心流程回归测试缺口，不是功能缺口。 |
| **仍存在的缺口** | 缺少覆盖 compaction/resume 后阶段步骤不丢失的回归测试。 |
| **证据** | `skills/forge/lib/resume/instructions.md` 有流程；未发现 `test/forge-resume/resume-phase-coverage.test.ts`。 |
| **建议修复** | 新增 focused test，断言 resume 会读取 status/progress 并保留当前 phase 的后续动作。 |

---

## B — 条件修复 / 降级修复（5 个）

### 5. `failure-sink-trigger-expansion`

| 项目 | 详情 |
|------|------|
| **当前判断** | 条件做。库能力和测试已经补上，剩余问题只在生产 emit 点。 |
| **已过期部分** | 原报告称缺命名测试不准确；`test/failure-sink-extended-triggers.test.ts` 与 property test 已覆盖 `loop_circuit_broken`。 |
| **仍存在的缺口** | 未看到真实 loop/circuit breaker 路径调用 failure sink emit。 |
| **建议修复** | 如果当前 loop 熔断路径仍活跃，补生产 emit；如果 loop driver 已废弃，则标为 superseded。 |

### 6. `sandbox-phased-implementation`

| 项目 | 详情 |
|------|------|
| **当前判断** | 条件做。Phase 1 主体已在当前架构落地，`--sandbox` flag 受旧 CLI 删除影响。 |
| **证据** | `src/sandbox-phased.ts`、`src/sandbox-profile.ts`、`src/sandbox-policy.ts`、`templates/sandbox.json`、相关测试和 skill advisory 文档均存在。 |
| **剩余缺口** | 原要求的 `--sandbox <profile>` CLI 接线没有当前等价入口。 |
| **建议修复** | 不复活旧 `forge-loop-cli.ts`。若需要运行时 profile 选择，另开当前 CLI/skill 入口设计；否则更新 spec 状态为 Phase 1 satisfied with CLI flag superseded。 |

### 7. `archive-transcript-purge`

| 项目 | 详情 |
|------|------|
| **当前判断** | 可做文档补齐。 |
| **缺口** | `README.md` 缺 `--purge-cc=ask|skip|auto` 使用说明；没有独立 archive skill。 |
| **建议修复** | 只补 README/docs，不创建新 skill，除非 archive 已成为公开命令。 |

### 8. `ultrareview-ci-integration`

| 项目 | 详情 |
|------|------|
| **当前判断** | 可做文档补齐。 |
| **缺口** | README 缺 CI AI review 使用说明。 |
| **建议修复** | 在 README 或 docs 增加一节，引用 workflow 与脚本入口。 |

### 9. `misc-forge-optimization`

| 项目 | 详情 |
|------|------|
| **当前判断** | 可做小文档/注释修复。 |
| **缺口** | `! <command>` 控制命令说明不足；`run-ci-ultrareview.sh` 缺 `--bare` 决策注释。 |
| **建议修复** | 文档化现有行为，不扩展新功能。 |

---

## C — 只做文档归档（7 个）

| Spec | 当前判断 | 建议 |
|------|----------|------|
| `structured-observability` | 旧 SDK/loop driver 已被替换。继续补 `--log-format` / `--log-level` 旧 CLI 接线投入产出低。 | 标记为 superseded；保留当前 hooks/learn 的观测路径。 |
| `engineering-governance-hardening` | 完整 Event Sourcing 很重，当前只有简化事件记录。 | 除非有 replay/stateHash 消费者，否则降级 spec 要求。 |
| `ccbp-inspired-hardening` | `ccbp-patterns-p2.md` 和 per-agent memory 属于低优先文档/组织尾巴。 | 不进入近期修复 spec。 |
| `forge-slimming-plan` | R14/R16 是评估报告，不是功能缺口。 | 等 metrics 窗口和调查材料存在后再做。 |
| `token-language-optimization` | 原逐条中英对照验证因 skill 布局重构失效。 | 若仍需要，改成自动扫描脚本；否则归档。 |
| `token-layered-defense` | draft/状态不清，且已有 context budget 规则。 | 先明确 spec 状态，不直接实现 hook。 |
| `cmux-integration` | 原 loop producer 要求引用已删除的 `src/sdk-driver.ts`。 | 不追旧 loop events；如需 cmux 事件，基于现有 mirror/hooks 另设 spec。 |

---

## D — 已过期 / 不应按旧建议做（4 个）

### `conflict-resolver-hook`

旧清单已过期。`skills/forge/lib/ship/instructions.md` 与 `skills/forge/lib/ship/references/delivery-options.md` 已写入 merge 冲突处理流程；`test/ship-merge-conflict.test.ts` 已覆盖 `handleMergeConflict`。除非要恢复 `ship_merge` effect 的真实执行器，否则不应按“补 `ship.ts` 集成”直接做。

### `pms-pack-v1`

旧清单已过期。`packs/pms/glossary/` 当前已有 `_shared.md` 与各 context 文件（如 `reservations.md`、`folio-billing.md`），不再是扁平单文件结构。

### `ship-delivery-unification`

该 spec 的核心 effect / `git-transaction.ts` 已被后续架构删除。恢复它是架构决策，不是缺口修补。建议标为 superseded 或另开 delivery effects spec。

### `output-bloat-control`

当前已存在 `docs/forge-constitution-detail.md` §2.6 的完整 prohibited patterns table。若仍认为缺 Caveman 词法规则，只应作为文案微调，不应列为质量缺口。

---

## 新修复优先级建议

| 优先级 | Spec | 理由 |
|--------|------|------|
| **P0（当前架构中功能不可用）** | `configchange-hook`, `hook-system-enhancement` | hook 脚本/事件声明存在但部分未注册，会造成虚假完成感。 |
| **P1（低成本可靠性/测试缺口）** | `process-lifecycle-management`, `resume-phase-coverage` | 小改动即可消除卡死风险或补核心流程回归保护。 |
| **P2（条件修复）** | `failure-sink-trigger-expansion`, `sandbox-phased-implementation` | 需要先确认生产入口是否仍存在；避免复活旧架构。 |
| **P3（文档收口）** | `archive-transcript-purge`, `ultrareview-ci-integration`, `misc-forge-optimization` | 不影响主流程，作为文档治理处理。 |
| **Superseded / 不执行** | `structured-observability`, `conflict-resolver-hook`, `pms-pack-v1`, `ship-delivery-unification`, `cmux-integration` loop producer | 原证据已失效或要求绑定旧架构。 |

---

## 后续 Spec

本复核产生新的执行 spec：

- `.forge/specs/partial-spec-backlog-remediation/requirements.md`
- `.forge/specs/partial-spec-backlog-remediation/design.md`
- `.forge/specs/partial-spec-backlog-remediation/tasks.md`

范围只覆盖 A/P1 中仍值得做的确定性缺口，并显式排除旧架构恢复。
