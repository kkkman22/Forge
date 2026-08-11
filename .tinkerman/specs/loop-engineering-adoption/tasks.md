---
topic: loop-engineering-adoption
date: "2026-06-16"
spec_ref: loop-engineering-adoption
format: lightweight
monolith_acknowledged: true
---

# Loop Engineering 橙皮书借鉴采纳 — 任务清单（已锁定）

> 三个需求相互独立。按依赖与风险分三个 Wave 顺序交付：**Wave1 R1（行为验证）→ Wave2 R3（理解腐烂）→ Wave3 R2（triage）**。
>
> **已知背景（研究成果约束）**：
> - `.tinkerman/config.md` 在**冻结区**，build 阶段 AI 不得修改。所有 config 变更只能落进 `scripts/init.sh` 的 heredoc 模板（生成新项目的默认值）+ 文档指引让用户手加。
> - adversarial-check 是 `agents/adversarial-check.md`（非 `.claude/agents/forge-review.md`）。`dist-plugin/agents/` 是分发镜像副本，构建时由 `scripts/build-dist.sh` 同步。
> - 新增 sub-skill 需跑 `scripts/sync-command-registry.mjs`（刷新 registry.toml + allowlist.ts）+ `scripts/build-lib-manifest.mjs`（刷新 manifest.json sha256）。
> - harness 接口已确认可复用：`runPlaywrightHarness(opts)`、`withDevServer(...)`、`detectProjectHarness(kind)`。

## Design Reference Index

| Anchor | 位置 | 用途 |
|---|---|---|
| `design.md#d1-行为验证挂在-adversarial-check-层` | D1 | 行为验证挂在 L4 而非新建层 |
| `design.md#d2-行为验证的高风险触发规则` | D2 | 路径 glob + diff 阈值 |
| `design.md#d3-行为验证复用-harness` | D3 | 复用 harness-playwright/dev-server-lifecycle |
| `design.md#d4-behavioral-confidence` | D4 | 行为证据=confidence:100，回退≤50 |
| `design.md#d5-triage-复用-loop-调度基建` | D5 | triage 复用 CronCreate/ScheduleWakeup |
| `design.md#d6-triage-inbox-用-markdown` | D6 | inbox 是人可读 markdown |
| `design.md#d7-commit-narrative-落盘` | D7 | 落盘而非塞上下文 |
| `design.md#d8-跨品牌明确不做` | D8 | 产品决策 |

## File Mapping

| 文件 | 动作 | 需求 |
|---|---|---|
| `agents/adversarial-check.md` | MODIFY | R1 |
| `src/harness-playwright.ts` | MODIFY（补 screenshotPath 实现） | R1 |
| `skills/forge/lib/build/instructions.md` | MODIFY（commit 流程加 narrative 落盘） | R3 |
| `skills/forge/lib/loop/instructions.md` | MODIFY（§10 Mission Summary 加复述段） | R3 |
| `.tinkerman/templates/loop-state.json` | MODIFY（加 commitNarrativePath 字段） | R3 |
| `skills/forge/lib/learn/instructions.md` | MODIFY（加理解确认环节） | R3 |
| `skills/forge/lib/triage/instructions.md` | CREATE | R2 |
| `src/triage-mcp-adapter.ts` | CREATE（仿 bitbucket-mcp-adapter.ts stub 模式） | R2 |
| `.tinkerman/templates/triage-inbox.md` | CREATE | R2 |
| `.tinkerman/templates/triage-state.json` | CREATE | R2 |
| `scripts/init.sh` | MODIFY（config heredoc 加 triage 默认块 + 复制 triage 模板） | R2 |
| `skills/forge/lib/manifest.json` | REGEN | R2 |
| `skills/forge/registry.toml` | REGEN | R2 |
| `src/forge-dispatcher/allowlist.ts` | REGEN | R2 |
| `dist-plugin/agents/adversarial-check.md` | REGEN（build-dist 同步） | R1 |
| `dist-plugin/skills/forge/lib/triage/` | REGEN（build-dist 同步） | R2 |
| `docs/forge-triage.md` | CREATE（触发语义 + 机器在线约束 + MCP 配置指引） | R2 |

---

## Wave 1 — R1 行为验证（adversarial-check 接 harness）

### Task 1: adversarial-check 新增行为验证职责
- **目标文件**：`agents/adversarial-check.md`
- **行为变更**：在现有 4 种对抗技术（Assumption Violation/Composition/Cascade/Abuse）之外，新增"行为验证"职责段：当变更命中高风险规则时，通过 harness 执行动态验证（跑测试/启动服务/查 DOM/截图）而非仅静态推理，产出 confidence:100 的机械证据。
- **Design Reference**：`design.md#d1`（挂在 L4）+ `design.md#d2`（高风险规则）+ `design.md#d4`（confidence 语义）
- **实现要点**：新增 `## Behavioral Verification` 章节，写明：触发规则（读 config 的 high_risk_globs + behavioral_diff_threshold，配置缺失用默认值）、执行链（harness-detector 探测→dev-server-lifecycle 启动→harness-playwright DOM/截图 / 或跑关联测试子集）、confidence 标注（行为证据=100，harness 不可用回退≤50 并标 `behavioral_verification: skipped(reason)`）、CI 无 GUI 按 sandbox 回退。
- **HITL/AFK**：AFK
- **Depends On**：[]
- **Verify**：`bash scripts/build-dist.sh` 成功同步到 dist-plugin；grep `Behavioral Verification` 命中 agents/adversarial-check.md
- **Commit**：`feat(review): adversarial-check behavioral verification (harness-driven, confidence:100)`

### Task 2: harness-playwright 补 screenshotPath 实现
- **目标文件**：`src/harness-playwright.ts`
- **行为变更**：`PlaywrightHarnessResult.screenshotPath` 当前声明但未实现（explore 报告确认）。补全：跑完 accessibility snapshot 后，`page.screenshot()` 写入传入的 `screenshotDir`（或临时目录），返回路径。
- **Design Reference**：`design.md#d3`（复用 harness）
- **实现要点**：扩展 `PlaywrightHarnessOptions` 加可选 `screenshotPath?: string`；`runPlaywrightHarness` 在 snapshot 后 `await page.screenshot({ path, fullPage: true })`；playwright 未安装时保持现有 `{ok:false,reason}` 回退。
- **HITL/AFK**：AFK
- **Depends On**：[1]
- **Verify**：`npm run check`（含 tsc + 已有 harness 测试）
- **Commit**：`feat(harness): implement screenshotPath in playwright harness`

### Task 3: 行为验证回归测试
- **目标文件**：`test/harness-playwright.test.ts`（已存在则 MODIFY，否则补断言）
- **行为变更**：测试覆盖 screenshotPath 落盘 + playwright 未安装时的 graceful 回退。
- **Design Reference**：`design.md#d3`
- **HITL/AFK**：AFK
- **Depends On**：[2]
- **Verify**：`npm test -- harness-playwright`
- **Commit**：`test(harness): screenshotPath + graceful-degradation coverage`

---

## Wave 2 — R3 理解腐烂对策（commit-narrative + Mission Summary + learn）

### Task 4: build commit 流程加 commit-narrative 落盘
- **目标文件**：`skills/forge/lib/build/instructions.md`
- **行为变更**：在 §6.2 原子提交处，commit 前向 `.tinkerman/runs/<run_id>/commit-narrative.md` 追加一节：`commit_sha` + `subject` + `what`（干了什么）+ `why`（为什么）。在 commit 上下文最丰富时生成。
- **Design Reference**：`design.md#d7`（落盘而非塞上下文）
- **实现要点**：§6.2 atomic commit 步骤加一步：生成 narrative 追加；run_id 从 loop-state 或 status 读取；文件不存在则建。
- **HITL/AFK**：AFK
- **Depends On**：[]
- **Verify**：grep `commit-narrative` 命中 build/instructions.md
- **Commit**：`feat(build): commit-narrative landing to .tinkerman/runs (anti understanding-rot)`

### Task 5: loop-state 模板加 commitNarrativePath 字段
- **目标文件**：`.tinkerman/templates/loop-state.json`
- **行为变更**：加 `"commitNarrativePath": ""` 字段，loop init 时填为 `.tinkerman/runs/<id>/commit-narrative.md`。
- **Design Reference**：`design.md#d7`
- **HITL/AFK**：AFK
- **Depends On**：[4]
- **Verify**：`npm run check`
- **Commit**：`feat(loop): commitNarrativePath in loop-state template`

### Task 6: Mission Summary 加关键改动复述段
- **目标文件**：`skills/forge/lib/loop/instructions.md`
- **行为变更**：§10 Shutdown 的 Mission Summary（当前仅 1 行 5 项统计）扩展，新增"关键改动复述段"：摘录 commit-narrative.md 关键节（≤5 条，每条 what+why），超 5 条输出"建议人工逐条复核"。
- **Design Reference**：`design.md#d7`
- **实现要点**：§10 的 Mission Summary 那一行扩展为含复述段的格式说明。
- **HITL/AFK**：AFK
- **Depends On**：[4, 5]
- **Verify**：grep `关键改动复述\|逐条复核` 命中 loop/instructions.md
- **Commit**：`feat(loop): Mission Summary recital section (anti understanding-rot)`

### Task 7: learn 加理解确认环节
- **目标文件**：`skills/forge/lib/learn/instructions.md`
- **行为变更**：从 runs/ 提取经验时（§0.7 Observability 段附近），加"理解确认"提示：要求用户至少复述一条关键改动意图，复述不出标记"理解地图需更新"。
- **Design Reference**：`design.md#d7`
- **HITL/AFK**：AFK
- **Depends On**：[4]
- **Verify**：grep `理解确认\|理解地图` 命中 learn/instructions.md
- **Commit**：`feat(learn): understanding-confirmation prompt when extracting from runs`

---

## Wave 3 — R2 triage（新 sub-skill + MCP + 配置 + 派生文件）

### Task 8: triage MCP adapter（stub 模式）
- **目标文件**：`src/triage-mcp-adapter.ts`
- **行为变更**：新建 adapter，仿 `src/bitbucket-mcp-adapter.ts` 的 graceful-degradation stub 模式。导出 `tryFetchJiraSprint(assignee, staleDays, toolNames): Promise<JiraFinding[] | null>`、`tryFetchBitbucketPRs(toolNames): Promise<BitbucketFinding[] | null>`。当前返回 null（stub），但接好 try/catch + tool-name 配置化接口，供 skill 文档声明调用。
- **Design Reference**：`design.md#d6` + `design.md#d2`（工具名配置化）
- **实现要点**：toolNames 参数来自 config 的 mcp.jira_tools/bitbucket_tools 映射；不可用返回 null 不抛错。
- **HITL/AFK**：AFK
- **Depends On**：[]
- **Verify**：`npm run check`
- **Commit**：`feat(triage): mcp adapter stubs (jira-sprint, bitbucket-pr) with graceful degradation`

### Task 9: triage sub-skill instructions
- **目标文件**：`skills/forge/lib/triage/instructions.md`（CREATE）
- **行为变更**：新增 `/forge triage` sub-skill。职责：拉取发现源（Jira active sprint via mcp-atlassian、Bitbucket PR/branch via Bitbucket MCP、git 降级兜底）→ severity 分级 → 写 inbox。明确触发语义：`/forge triage` 手动始终可用；`--install` opt-in 装定时（用户自定义 cron）；`--uninstall`/`--status`。
- **Design Reference**：`design.md#d5`（复用调度）+ `design.md#d6`（inbox markdown）+ 全部 R2-AC
- **实现要点**：frontmatter 含 `description`/`dispatch_mode: fork`/`allowed_tools`（声明 MCP 工具名 + CronCreate/CronDelete/CronList + Read/Write/Bash/Glob/Grep）；MCP 工具名从 config 映射读，不硬编码；降级链（任一 MCP 不可用→跳过+git 兜底，标 `source: git-fallback`）；MCP 未配置给配置指引不静默失败。
- **HITL/AFK**：AFK
- **Depends On**：[8]
- **Verify**：文件存在且 frontmatter 合法；`node scripts/sync-command-registry.mjs` 后 triage 进 registry
- **Commit**：`feat(triage): /forge triage sub-skill (discovery action — jira+bitbucket+git)`

### Task 10: triage 模板（inbox + state）
- **目标文件**：`.tinkerman/templates/triage-inbox.md`（CREATE）+ `.tinkerman/templates/triage-state.json`（CREATE）
- **行为变更**：triage-inbox.md 模板含条目格式范例（`## <id>` + frontmatter：source/external_ref/severity/detected_at/status/summary/suggested_action）；triage-state.json 含 `{"last_triage_at": ""}`。
- **Design Reference**：`design.md#d6`
- **HITL/AFK**：AFK
- **Depends On**：[]
- **Verify**：文件存在
- **Commit**：`feat(triage): inbox + state templates`

### Task 11: init.sh 加 triage 配置默认块 + 模板复制
- **目标文件**：`scripts/init.sh`
- **行为变更**：在 config heredoc（L354-422）里加 `triage:` 默认配置块（enabled:false / cron 示例 / sources / stale_days / assignee / mcp 工具映射默认值）；在复制模板步骤加 triage-inbox.md + triage-state.json 复制到用户 `.tinkerman/`。
- **Design Reference**：`design.md#d6`（config 块结构）+ 冻结区约束（只能改 init 模板）
- **实现要点**：config.md 在冻结区，不能在 build 改 Forge 自己的 config，只能改 init 模板让新项目得默认值。文档指引老用户手加。
- **HITL/AFK**：AFK
- **Depends On**：[9, 10]
- **Verify**：`bash -n scripts/init.sh`（语法检查）
- **Commit**：`feat(init): triage config defaults + template copy in forge init`

### Task 12: 派生文件重生
- **目标文件**：`skills/forge/registry.toml` + `src/forge-dispatcher/allowlist.ts` + `skills/forge/lib/manifest.json`（REGEN）
- **行为变更**：跑 `node scripts/sync-command-registry.mjs` + `node scripts/build-lib-manifest.mjs`，让 triage 注册进 dispatcher allowlist + registry + manifest。
- **Design Reference**：研究成果（3 个派生文件）
- **HITL/AFK**：AFK
- **Depends On**：[9]
- **Verify**：`grep triage src/forge-dispatcher/allowlist.ts` 命中；`grep triage skills/forge/registry.toml` 命中
- **Commit**：`build(regen): register triage in registry/allowlist/manifest`

### Task 13: triage 文档（触发语义 + 约束 + MCP 指引）
- **目标文件**：`docs/forge-triage.md`（CREATE）
- **行为变更**：说明：默认手动触发（`/forge triage`）；`--install` opt-in 定时（用户自定义 cron）；本地 cron 需 Claude Code 进程活着，不承诺关机跑；云端/headless 明确排除；MCP（mcp-atlassian + Bitbucket MCP）配置指引 + 工具名映射说明。
- **Design Reference**：R2-AC7 + R2-AC9
- **HITL/AFK**：AFK
- **Depends On**：[9]
- **Verify**：文件存在
- **Commit**：`docs(triage): trigger semantics, machine-online constraint, mcp setup`

---

## 整体验收（DoD）

| 验收点 | 任务 | 验证方式 |
|---|---|---|
| 行为验证可执行 | 1,2,3 | 对前端组件改动跑 review，adversarial-check 产 confidence:100 证据 |
| 行为验证回退 | 1 | harness 不可用回退静态推理标 skipped |
| commit narrative 落盘 | 4,5 | build commit 后 `.tinkerman/runs/<id>/commit-narrative.md` 出现条目 |
| Mission Summary 复述 | 6 | loop 跑完 Mission Summary 含复述段 |
| learn 理解确认 | 7 | `/forge learn` 提示复述 |
| triage 写 inbox | 9,10 | `/forge triage` 后 inbox 出结构化条目 |
| triage 增量扫描 | 10 | 第二次只扫 last_triage_at 之后 |
| triage MCP 降级 | 8,9 | MCP 断开降级 git-fallback 不阻断 |
| triage 触发语义 | 9,13 | enabled:false 手动可用；--install 自定义 cron |
| triage 注册进 dispatcher | 12 | `/forge triage` 可被路由 |
| 零配置分发 | 全部 | 装插件即得，无新 npm 依赖 |

## Spec Coverage Matrix

| 需求 AC | 覆盖任务 |
|---|---|
| R1-AC1~AC8 | 1, 2, 3 |
| R2-AC1 | 9 |
| R2-AC2 | 8, 9 |
| R2-AC3 | 8, 9 |
| R2-AC4 | 9, 10 |
| R2-AC5 | 9 |
| R2-AC6 | 9, 10 |
| R2-AC7 | 9, 13 |
| R2-AC8 | 11 |
| R2-AC9 | 9, 13 |
| R3-AC1 | 6 |
| R3-AC2 | 4, 5 |
| R3-AC3 | 4 |
| R3-AC4 | 6 |
| R3-AC5 | 7 |
