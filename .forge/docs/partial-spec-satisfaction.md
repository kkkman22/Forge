---
description: "Use when assessing which specs are partially implemented and what gaps remain"
updated: 2026-06-07
---

# 部分满足 Spec 清单 —— 缺口与证据

> 来源：`.forge/spec-audit-report.md`（2026-06-03）+ 子 agent 逐 spec 代码核对
> 生成时间：2026-06-07
> 范围：`.kiro/specs/` 中状态为 **部分满足** 的 20 个 spec

---

## 总览

| 类别 | 数量 | 说明 |
|------|------|------|
| P1 — 功能未生效/会误导 | 3 | 代码存在但未接线，导致功能永远不可用 |
| P2/P3 — 文档/测试/命名缺口 | 16 | 主体实现完整，缺文档、测试或 CLI 接线 |
| 架构重构导致的部分废弃 | 1 | 主体功能被重构覆盖，残留文档漂移 |

---

## P1 — 功能未生效 / 会误导（3 个）

### 1. `configchange-hook`

| 项目 | 详情 |
|------|------|
| **缺口** | 脚本存在但 `ConfigChange` 事件在 `plugin.json`/`hooks.json`/`settings.json` 注册数 = 0，hook 永不触发 |
| **证据** | `scripts/config-changed-hook.mjs` 与 `test/config-changed-hook.test.ts` 存在且已合并（commit `48487e23`），但 `plugin.json` 在 refactor `2be2c777` 中剥离了 `ConfigChange` 事件，当前 `hooks/hooks.json` 无此事件 |
| **Req 2** | 完全未做 —— 未在任何配置文件中注册 |
| **建议修复** | 在 `hooks/hooks.json` 新增 `ConfigChange` 段，或在 `.claude/settings.json` 注册 |

### 2. `hook-system-enhancement`

| 项目 | 详情 |
|------|------|
| **缺口** | 5 个新 hook 脚本已在磁盘但未接入 `hooks.json`（注册数 = 0）；R1"全部用 args 数组"未达标 |
| **证据** | `hooks/hooks.json` 中现存 62 个 `command` 字符串、0 个 `args`、0 个 `mcp_tool`；`PermissionDenied`/`WorktreeRemove` 等事件未注册 |
| **建议修复** | 批量将 `command` 字符串迁移为 `args` 数组形式；补注册缺失的 5 个 hook 事件 |

### 3. `structured-observability`

| 项目 | 详情 |
|------|------|
| **缺口** | 纯函数库齐全且有测试，但零调用者 |
| **证据** | 无 CLI 解析 `--log-format`/`--log-level`；无驱动实例化 sink；logger/perf 库未接入任何运行时代码路径 |
| **建议修复** | 在 `src/` 调度器或 `skills/forge/lib/build/instructions.md` 中增加 observability sink 初始化调用 |

---

## P2/P3 — 文档/测试/命名缺口（16 个）

### 4. `archive-transcript-purge`

| 项目 | 详情 |
|------|------|
| **缺口** | README 小节 + skill 文档缺失（Req 5.1/5.4） |
| **证据** | `scripts/archive-spec.sh:48` 支持 `--purge-cc=ask\|skip\|auto`，但 `README.md` 无相关说明；`skills/forge-archive/SKILL.md` 不存在 |
| **建议修复** | 在 `README.md` 增加归档流程说明；补归档 skill 文档 |

### 5. `ultrareview-ci-integration`

| 项目 | 详情 |
|------|------|
| **缺口** | README "CI AI 评审"小节缺失（Req 6.1） |
| **证据** | `scripts/run-ci-ultrareview.sh`、`.github/workflows/ultrareview.yml` 存在；但 `README.md` 无 "CI AI 评审" 章节 |
| **建议修复** | 在 `README.md` 或 `docs/` 中补充 CI 评审使用说明 |

### 6. `misc-forge-optimization`

| 项目 | 详情 |
|------|------|
| **缺口** | README 缺 `! <command>` 说明（R8）；`run-ci-ultrareview.sh` 缺 `--bare` 决策注释 |
| **证据** | `skills/forge/lib/control-cli/instructions.md` 无 `!command` 格式说明；`scripts/run-ci-ultrareview.sh` 无 `--bare` 模式注释 |
| **建议修复** | 补 README 章节和脚本注释 |

### 7. `output-bloat-control`

| 项目 | 详情 |
|------|------|
| **缺口** | §2.6 缺 Caveman 式散文压缩词法规则（Req 2.AC1） |
| **证据** | `CLAUDE.md` §2.6 有 Output Conciseness 原则，但无具体的 "Caveman 式压缩词法" 规则表 |
| **建议修复** | 在 `CLAUDE.md` 或 `.claude/rules/output-conciseness.md` 中增加具体词法压缩示例 |

### 8. `conflict-resolver-hook`

| 项目 | 详情 |
|------|------|
| **缺口** | 4 个触发点只接了 2 个，`ship.ts` 集成缺失 |
| **证据** | `src/conflict-resolver.ts` 存在，但 `src/ship.ts` 未调用冲突解析器；`skills/forge/lib/ship/instructions.md` 无冲突处理说明 |
| **建议修复** | 在 ship 流程中增加 `.forge/` 冲突检测与自动解析调用 |

### 9. `engineering-governance-hardening`

| 项目 | 详情 |
|------|------|
| **缺口** | Event Sourcing 欠交付（无 `EventLogEntry`/`replay()`/`stateHash`） |
| **证据** | `src/event-writer.ts` 和 `src/events-cursor.ts` 存在，但仅为简化版事件记录；无 `stateHashBefore`/`stateHashAfter`、无 `replay()`、无 `hashState` |
| **建议修复** | 扩展 `src/event-writer.ts` 为完整 Event Sourcing 模型，或降级 spec 要求以匹配当前实现 |

### 10. `failure-sink-trigger-expansion`

| 项目 | 详情 |
|------|------|
| **缺口** | `loop_circuit_broken` 无 emit 点；1 个命名测试缺失 |
| **证据** | `src/failure-sink.ts` 存在但无 `loop_circuit_broken` 触发逻辑；`test/failure-sink.test.ts` 缺少命名测试用例 |
| **建议修复** | 在 loop 失败检测逻辑中增加 `failureSink.emit('loop_circuit_broken')` 调用 |

### 11. `process-lifecycle-management`

| 项目 | 详情 |
|------|------|
| **缺口** | `cleanup-chain.ts:42` 的 git `execFileSync` 缺 30s 超时（Req 6） |
| **证据** | `src/process-lifecycle/cleanup-chain.ts:42` 调用 `execFileSync('git', ...)` 无 `timeout` 参数 |
| **建议修复** | 增加 `{ timeout: 30000 }` 选项 |

### 12. `sandbox-phased-implementation`

| 项目 | 详情 |
|------|------|
| **缺口** | `--sandbox <profile>` CLI flag 未接线 |
| **证据** | `src/sandbox-phased.ts` 有完整 Phase 1 API（`SandboxConfig`, `checkFilesystemPolicy`, `loadSandboxConfig`），但 `src/forge-loop-cli.ts` 已被删除，无 CLI 入口 |
| **建议修复** | 在现有 CLI 或 skill 入口中增加 `--sandbox` 参数解析 |

### 13. `resume-phase-coverage`

| 项目 | 详情 |
|------|------|
| **缺口** | Req 4.2/4.3 要求的回归测试不存在 |
| **证据** | `skills/forge/lib/resume/instructions.md` 有 resume 流程，但无 `test/forge-resume/resume-phase-coverage.test.ts` |
| **建议修复** | 补充 resume 阶段回归测试 |

### 14. `ccbp-inspired-hardening`

| 项目 | 详情 |
|------|------|
| **缺口** | `ccbp-patterns-p2.md` 缺；per-agent memory 目录未建 |
| **证据** | `.claude/agent-memory/` 存在但未按 per-agent 子目录组织；`docs/ccbp-patterns-p2.md` 或 `.forge/knowledge/ccbp-patterns-p2.md` 不存在 |
| **建议修复** | 创建 per-agent memory 子目录结构；补全 ccbp patterns P2 文档 |

### 15. `forge-slimming-plan`

| 项目 | 详情 |
|------|------|
| **缺口** | 两个评估报告（R14/R16）未产出 |
| **证据** | `tasks.md` 显示 21/23 完成；R14（输出 token 节省率报告）和 R16（开发者满意度调查）待产出 |
| **建议修复** | 收集 14 天 metrics 后生成评估报告 |

### 16. `pms-pack-v1`

| 项目 | 详情 |
|------|------|
| **缺口** | glossary 用扁平文件而非 spec 要求的 per-context 子目录 |
| **证据** | `packs/pms/glossary/` 为扁平结构，无 `contexts/` 子目录 |
| **建议修复** | 重构 glossary 为 per-context 子目录结构 |

### 17. `token-language-optimization`

| 项目 | 详情 |
|------|------|
| **缺口** | P2 中→英转换在重构后无法逐条确认 |
| **证据** | `src/skill-scheduler.ts` 有 `build-light` phase，`skills/forge/lib/build-light/instructions.md` 存在；但原 P2 逐条中英对照检查因 skill 布局重构已无法机械验证 |
| **建议修复** | 增加自动化检查脚本，验证所有 skill instructions.md 中无残留中文命令名 |

### 18. `token-layered-defense`

| 项目 | 详情 |
|------|------|
| **缺口** | draft 状态，hooks 未确认 |
| **证据** | `skills/forge/lib/build/instructions.md` 有 context budget 规则，但无显式 "token-layered-defense" hook |
| **建议修复** | 明确 spec 状态或在 `hooks/hooks.json` 中注册对应防御 hook |

### 19. `cmux-integration`

| 项目 | 详情 |
|------|------|
| **缺口** | loop 事件 producer（`loop_started` 等）未接线 |
| **证据** | `scripts/cmux-mirror/` 存在，但 `skills/forge/lib/loop/instructions.md` 中无 `loop_started`/`loop_completed` 事件 emit |
| **建议修复** | 在 loop skill 的关键阶段增加 cmux 事件 emit |

### 20. `ship-delivery-unification`

| 项目 | 详情 |
|------|------|
| **缺口** | 属于架构重构废弃的边界案例：配置解析器和 worktree 管理幸存，但核心 effect 类型和 git-transaction 已删 |
| **证据** | `src/execution-mode.ts` 有 `DeliveryMethod`；`src/worktree-manager.ts` 有 `decideWorktreeCleanup`；但 `src/git-transaction.ts` 已删，`ship_merge`/`ship_push_pr`/`ship_discard` effect 不存在 |
| **建议修复** | 决定是否重新实现 delivery effects，或归档为废弃 spec |

---

## 修复优先级建议

| 优先级 | Spec | 理由 |
|--------|------|------|
| **P0（阻塞功能）** | `configchange-hook`, `hook-system-enhancement`, `structured-observability` | 功能存在但永远不可用，造成维护噪音和虚假安全感 |
| **P1（质量缺口）** | `sandbox-phased-implementation`, `process-lifecycle-management`, `conflict-resolver-hook`, `resume-phase-coverage` | 有具体安全/可靠性缺口，修复成本低 |
| **P2（文档/完善）** | `archive-transcript-purge`, `ultrareview-ci-integration`, `misc-forge-optimization`, `output-bloat-control`, `engineering-governance-hardening`, `failure-sink-trigger-expansion`, `ccbp-inspired-hardening`, `forge-slimming-plan`, `pms-pack-v1`, `token-language-optimization`, `token-layered-defense`, `cmux-integration`, `ship-delivery-unification` | 不影响核心功能，改善文档和完整性 |

---

## 关联文档

- `.forge/spec-audit-report.md` — 完整审计报告
- `.forge/decisions/2026-05-18-review-fallback-ladder.md` — review fallback 决策
- `.forge/specs/audit-remediate-p0p1/requirements.md` — P0/P1 修复 spec
