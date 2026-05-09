---
feature: "specs-unchecked-tasks-remediation"
status: "locked"
date: "2026-05-09"
import_source: ".forge/findings/specs-unchecked-tasks-remediation.md"
---

## 目的

补齐 `.kiro/specs/` 下 4 个 spec 的未完成任务，消除已注册命令/能力与实际代码之间的差距。为 Forge 框架开发者提供完整的 review 四层流水线和 ship 验收门禁。

## 需求

### 需求 1：Review Layer 4 前端检查集成

Review 流水线当前仅执行 3 层（spec/quality/security）。`src/frontend-check.ts` 已实现静态扫描能力但未被 `src/review.ts` 调用。当项目包含 Vue 文件时，review 应自动触发 Layer 4 前端可访问性检查。

**场景 1.1**：当项目包含 `.vue` 文件且 `/forge review` 执行时，则 review 自动启动 frontend-check 子代理，输出包含 Layer 4 段落。

**场景 1.2**：当项目不包含 `.vue` 文件时，则 review 流水线仅执行原有 3 层，不启动 frontend-check。

**场景 1.3**：当 frontend-check 发现 P0/P1 违规时，则该发现通过 `mergeReviewResults` 进入合并流水线并阻断 ship。

### 需求 2：Ship 验收门禁集成

`--with-acceptance` CLI 标志已注册但 `src/ship.ts` 未对接。Spec 中声明 `acceptance_eval: true` 或使用 `--with-acceptance` 时，ship 流程应执行验收场景并可选阻断交付。

**场景 2.1**：当 spec frontmatter `acceptance_eval=true` 且存在验收场景时，则 ship 自动执行验收，结果写入 `.forge/reviews/<topic>-acceptance.md`。

**场景 2.2**：当 `acceptance_blocks_ship=true` 且验收存在 FAIL 场景时，则 ship 被阻断。

**场景 2.3**：当 `acceptance_eval` 和 `--with-acceptance` 均未设置时，则验收门禁不触发，ship 正常进行。

**场景 2.4**：当 CLI 传入 `--with-acceptance` 时，则无论 spec frontmatter 设置如何，验收均触发。

### 需求 3：Agent 背景执行配置

`.claude/agents/quality-check.md` 和 `security-check.md` 的 frontmatter 缺少 `background: true`。这两个子代理应在 review 中以背景模式运行，单个失败不阻断其他层。

**场景 3.1**：当 `/forge review` 启动 quality-check 和 security-check 子代理时，则两者以 `background: true` 模式运行。

**场景 3.2**：当 quality-check 失败但 security-check 成功时，则 security-check 结果正常合并，review 输出标注 quality-check 失败。

### 需求 4：Findings 保留策略

`.forge/findings/` 目录无清理策略，长期运行导致磁盘膨胀。

**场景 4.1**：当 `scripts/prune-event-logs.sh` 执行时，则同时归档 `.forge/findings/` 下超过 `findings_retention_days`（默认 30 天）的文件至 `.forge/archive/findings/`。

**场景 4.2**：当 `.forge/findings/` 不存在时，则脚本 exit 0 不报错。

**场景 4.3**：当传入 `--dry-run` 时，则仅打印将归档的文件列表，不执行移动。

### 需求 5：validate-skill-descriptions 默认严格模式

`scripts/validate-skill-descriptions.mjs` 默认 warning 模式，与 `src/skill-description.ts` 的 `ENFORCEMENT_MODE = "error"` 不一致。`npm run check` 通过 wrapper 调用但未传 `--strict`，导致 CI 不捕获违规。

**场景 5.1**：当 `node scripts/validate-skill-descriptions.mjs` 执行时，则默认以 error 模式运行，违规导致 exit 1。

**场景 5.2**：当传入 `--lenient` 时，则降级为 warning 模式（逃生阀）。

### 需求 6：PR 模板 Skill 勾选项

PR 模板缺少 skill 骨架验证勾选项。

**场景 6.1**：当开发者创建 PR 时，则模板包含 Skill Changes 勾选区域（骨架合规、description 验证通过）。

### 需求 7：Evolved Rule R3 Source 引用修复

`evolved-rules.md` R3 的 Source 引用不存在的文件。

**场景 7.1**：当检查 evolved-rules.md 时，则 R3 Source 字段引用存在的文件路径。

### 需求 8：Ship Open Zone 和 post_push_verify_enabled 配置

`.forge/config.md` 和 `templates/config.md` 的开放区缺少 `.forge/ship/*.md`，且缺少 `post_push_verify_enabled` 字段。

**场景 8.1**：当读取 `.forge/config.md` 开放区时，则列表包含 `.forge/ship/*.md`。

**场景 8.2**：当读取 `templates/config.md` frontmatter 时，则包含 `post_push_verify_enabled` 字段。

### 需求 9：Acceptance Matrix 追溯文档

`.kiro/specs/cursor-team-kit-integration/` 下缺少 `acceptance-matrix.md`。

**场景 9.1**：当查看 acceptance-matrix.md 时，则包含 R1–R14 全部 AC 到实现任务和测试文件的映射表。

### 需求 10：cmux-mirror 集成测试补全

生产代码完整，缺 8 个集成测试（Sprint 3-4）。

**场景 10.1**：当运行 `npm test -- cmux-mirror` 时，则覆盖 push.sh、fs-watch、polling、events、review-observe、session-boundary、push-socket、tmux-passthrough 8 个场景，全部通过。

## 场景汇总

| ID | Scenario | Requirement |
|----|----------|-------------|
| 1.1 | Vue 项目触发 Layer 4 | 需求 1 |
| 1.2 | 非 Vue 项目跳过 Layer 4 | 需求 1 |
| 1.3 | P0/P1 违规阻断 ship | 需求 1 |
| 2.1 | acceptance_eval=true 触发验收 | 需求 2 |
| 2.2 | blocks_ship + FAIL 阻断 | 需求 2 |
| 2.3 | 均未设置不触发 | 需求 2 |
| 2.4 | --with-acceptance 无视 spec flag | 需求 2 |
| 3.1 | background 模式运行 | 需求 3 |
| 3.2 | 单 agent 失败不阻断 | 需求 3 |
| 4.1 | findings 超 30 天归档 | 需求 4 |
| 4.2 | 目录不存在 exit 0 | 需求 4 |
| 4.3 | --dry-run 仅打印 | 需求 4 |
| 5.1 | 默认 error 模式 | 需求 5 |
| 5.2 | --lenient 逃生阀 | 需求 5 |
| 6.1 | PR 含 skill 勾选 | 需求 6 |
| 7.1 | R3 Source 引用存在 | 需求 7 |
| 8.1 | ship 在开放区 | 需求 8 |
| 8.2 | post_push_verify_enabled 字段 | 需求 8 |
| 9.1 | acceptance matrix 完整 | 需求 9 |
| 10.1 | 8 个 cmux 测试全通过 | 需求 10 |

## Current State

### Related Modules

| Module | File | Line | Current Behavior |
|--------|------|------|------------------|
| Review Subagent Builder | `src/review.ts` | 487-514 | `buildReviewSubagents` 硬编码 3 层（spec/quality/security） |
| Review Merge | `src/review.ts` | 539-562 | `mergeReviewResults` 按 finding 结构验证，不按层过滤 — 新增层安全 |
| Layer Status Tracking | `src/review.ts` | 571-629 | `layers_status` 从子代理类型动态生成 — 新增类型自动追踪 |
| Ship Gate Chain | `src/ship.ts` | 119-213 | 3 个门禁（base/checklist/freshness），无验收路径 |
| Frontend Check | `src/frontend-check.ts` | 1-166 | `scanVueTemplate` + `parseAxeResult` + `detectTierAvailability` 存在，无 `scanVueProject` 驱动 |
| Acceptance Parser | `src/accept.ts` | 1-60 | `parseExplicitScenarios` + 类型定义完整 |
| Acceptance Driver | `src/accept-driver.ts` | 1-50 | Runner 接口 + API/UI/CLI Runner 实现，未连接 ship.ts |
| Quality-Check Agent | `.claude/agents/quality-check.md` | 1-9 | Frontmatter 无 `background` 字段 |
| Security-Check Agent | `.claude/agents/security-check.md` | 1-9 | Frontmatter 无 `background` 字段 |
| Validate Descriptions | `scripts/validate-skill-descriptions.mjs` | 46 | `strict = args.includes("--strict")` — 默认 false |
| Prune Event Logs | `scripts/prune-event-logs.sh` | 35-37 | 归档 reviews/ 和 acceptance/，无 findings/ |
| PR Template | `.github/pull_request_template.md` | 1-32 | 无 Skill Changes 勾选区域 |
| Config | `.forge/config.md` | 1-72 | 开放区无 `.forge/ship/*.md`，无 `post_push_verify_enabled` |
| Evolved Rules | `.forge/knowledge/evolved-rules.md` | R3 | Source 引用 `.forge/knowledge/glm-summary-ending.md`（不存在） |

### Structure Overview

```
src/
├── review.ts          # buildReviewSubagents → mergeReviewResults → markLayerStatus
├── ship.ts            # checkShipGate → checkShipGateWithChecklist → checkShipGateWithFreshness
├── frontend-check.ts  # scanVueTemplate, parseAxeResult, detectTierAvailability (未连接)
├── accept.ts          # parseExplicitScenarios, Scenario/Verdict types (未连接 ship)
├── accept-driver.ts   # Runner interface, apiRunner (未连接 ship)
├── subagent-runner.ts # 已用 Promise.allSettled ✓
scripts/
├── validate-skill-descriptions.mjs  # --strict flag 存在但非默认
├── prune-event-logs.sh              # 无 findings 归档
.claude/agents/
├── quality-check.md    # 无 background: true
├── security-check.md   # 无 background: true
```

## Proposed Change

### To Change

1. **`src/frontend-check.ts`**：新增 `scanVueProject` 纯函数，glob Vue 文件并调用 `scanVueTemplate`
2. **`src/review.ts`**：`buildReviewSubagents` 增加 Layer 4 frontend-check 条件启动（检测 Vue 文件存在）；确认 `mergeReviewResults` 对新层类型安全（已验证：按结构验证不按层过滤）
3. **`src/ship.ts`**：新增 `runAcceptanceGate` 函数，在现有门禁链后调用，受 `acceptance_eval` 和 `--with-acceptance` 控制
4. **`.claude/agents/quality-check.md`** 和 **`security-check.md`**：frontmatter 追加 `background: true`
5. **`scripts/validate-skill-descriptions.mjs`**：默认切到 strict（`--lenient` 逃生阀）
6. **`.github/pull_request_template.md`**：追加 Skill Changes 勾选区域
7. **`.forge/knowledge/evolved-rules.md`**：R3 Source 改为存在的文件路径
8. **`.forge/config.md`** 和 **`templates/config.md`**：开放区追加 `.forge/ship/*.md`，frontmatter 追加 `post_push_verify_enabled` 和 `findings_retention_days`
9. **`scripts/prune-event-logs.sh`**：扩展归档逻辑至 `.forge/findings/`
10. **`.kiro/specs/cursor-team-kit-integration/acceptance-matrix.md`**：创建 R1-R14 追溯矩阵
11. **8 个 cmux 集成测试**：在 `test/cmux-mirror/` 下补全

### Explicitly Unchanged

- `src/subagent-runner.ts` — 已使用 `Promise.allSettled`，无需修改
- `src/accept.ts` / `src/accept-driver.ts` — 类型定义和 runner 实现不变，仅 ship.ts 对接
- `src/frontend-check.ts` 的 `scanVueTemplate` / `parseAxeResult` — 已有实现不改
- `context-bloat-control` spec — 已验证仅含可选测试，不进入修复
- Tier B/C 前端检查 — 本次仅实现 Tier A 静态扫描

## 不做什么

- 不实现 Tier B（axe-core 运行时扫描）或 Tier C（MCP devtools）前端检查
- 不修改 cmux-mirror 生产代码
- 不修改 `src/skill-description.ts` 的 `ENFORCEMENT_MODE`（已正确）
- 不重构现有 3 层 review 流水线或 3 个 ship 门禁
- 不增加新的 evolved rule
- 不修改 CLAUDE.md 宪法条款

## Reversibility

### Rollback Checklist

1. `git revert` 对应 commit 即可回滚所有变更
2. 每个需求独立提交，可按需选择性回滚
3. `background: true` 字段被旧版 Claude Code graceful ignore — 回滚安全
4. `--lenient` 逃生阀允许快速恢复 validate-skill-descriptions 的 warning 模式

### Mount Points

| Change | Mount Point | Impact if Removed |
|--------|-------------|-------------------|
| Layer 4 in review | `buildReviewSubagents` 新增条件分支 | 退回 3 层，无破坏 |
| Acceptance gate in ship | `checkShipGate*` 链后新增调用 | 退回无验收，ship 正常 |
| background: true | agent frontmatter | 旧版忽略，无影响 |
| findings retention | prune-event-logs.sh 新增段落 | 退回无清理，无破坏 |
| strict default | mjs 脚本默认值 | 加 `--lenient` 恢复 |

## 反漂移声明

**主目标**：消除 4 个 spec 中已注册能力与实际代码的差距，使 `/forge review` 完整执行 4 层、`/forge ship --with-acceptance` 实际生效。

**非目标代理信号**：
- 不扩展 review 发现的 severity 体系（P0-P3 不变）
- 不为 acceptance gate 增加新的 CLI 子命令
- 不修改 cmux-mirror 架构
- 不实现 Tier B/C 运行时前端检查

**验证材料角色**：`npm run check` 绿灯 + `npm test` 绿灯（含新增 8 个 cmux 测试）+ 手动验证 Layer 4 和 acceptance gate 集成。

## Delta

### New

- `scanVueProject` 函数（src/frontend-check.ts）
- `runAcceptanceGate` 函数（src/ship.ts）
- `test/review-layer4-frontend-check.test.ts`
- `test/ship-acceptance-gate.test.ts`
- `test/review-background-fan-in.test.ts`
- `test/prune-findings-retention.test.sh`
- `.kiro/specs/cursor-team-kit-integration/acceptance-matrix.md`
- 8 个 `test/cmux-mirror/mirror-*.test.ts` 文件

### Modified

- `src/review.ts`（buildReviewSubagents 增加 Layer 4）
- `src/ship.ts`（新增 acceptance gate 集成）
- `.claude/agents/quality-check.md`（frontmatter + background）
- `.claude/agents/security-check.md`（frontmatter + background）
- `scripts/validate-skill-descriptions.mjs`（默认 strict）
- `.github/pull_request_template.md`（追加 skill 勾选）
- `.forge/knowledge/evolved-rules.md`（R3 Source 修正）
- `.forge/config.md`（开放区 + frontmatter 字段）
- `templates/config.md`（开放区 + frontmatter 字段）
- `scripts/prune-event-logs.sh`（findings 归档段落）

### Unchanged

- `src/subagent-runner.ts`
- `src/accept.ts`
- `src/accept-driver.ts`
- `src/skill-description.ts`
- 所有 cmux-mirror 生产代码
