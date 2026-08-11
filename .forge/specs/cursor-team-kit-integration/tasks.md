---
feature: cursor-team-kit-integration
layout: tasks
created: 2026-05-08
spec_ref: ".forge/specs/cursor-team-kit-integration/requirements.md"
---

# Implementation Plan

按 Sprint 分批落地，每个任务都显式关联 Requirement AC 与 Design 章节。任务粒度控制在 0.5–1 个工作日。

TDD 铁律：每个含实现代码的任务都按 RED → GREEN → REFACTOR 执行，禁止先写实现再补测试。

---

## Sprint 1 — 证据化验证 + AI 异味维度 + 原子规则目录（≈ 3 天）

- [x] 1. forge-verify SKILL 基础骨架
  - [x] 1.1 创建 `skills/forge-verify/SKILL.md`（≤ 3072 bytes），仅作路由文档，详细逻辑链接到 references
    - 验证：`scripts/validate-skill-length.mjs` 通过 [R1.12]
    - 引用：Design §4.1
  - [x] 1.2 创建 `skills/forge-verify/references/workflow.md`、`artifact-layout.md`、`baseline-resolution.md`
    - 三个文件分别覆盖流程、产物布局、baseline 回退链
    - 引用：Design §4.1、§3.2
  - [x] 1.3 创建 `skills/forge-verify/templates/claim.md.tmpl` 与 `verdict.md.tmpl`
    - Frontmatter schema 严格按 Design §3.2.1 和 §3.2.2
    - 引用：[R1.2, R1.5]

- [x] 2. verdict-parser.ts（纯函数，TDD）
  - [x] 2.1 RED：`test/verify-verdict-totality.property.test.ts`
    - fast-check 生成任意字符串（含损坏 / 乱码 / 空字符串）作为 `verdict.md` 内容，断言 `parseVerdict(content).verdict ∈ {"VERIFIED", "NOT_VERIFIED", "INCONCLUSIVE"}`
    - 运行 200 次迭代
    - 引用：[R13.3]
  - [x] 2.2 GREEN：实现 `src/verdict-parser.ts` 的 `parseVerdict()` 与 `ParsedVerdict` 类型
    - 损坏输入统一返回 `{ verdict: "INCONCLUSIVE", ... }`
    - 签名：`export function parseVerdict(content: string): ParsedVerdict`
    - 引用：Design §4.1

- [x] 3. baseline-resolver.ts（4 级回退链）
  - [x] 3.1 RED：`test/verify-baseline-resolver.test.ts` 集成测试
    - 测试用例（至少 5 个）：显式 `--baseline abc1` / 有 `origin/main` / 无 `origin` 但有父 / shallow clone / 纯 topic 无 git
    - 引用：[R1.10]
  - [x] 3.2 GREEN：实现 `src/baseline-resolver.ts`
    - 签名：`resolveBaseline(topic, explicit?): Promise<BaselineResolution>`
    - 使用 `child_process` 跑 `git rev-parse`、`git merge-base`、`git rev-parse HEAD^`
    - 全部失败返回 `{ ref: null, strategy: "none" }`
    - 引用：Design §4.1

- [x] 4. verify.ts orchestrator + artifact invariant
  - [x] 4.1 RED：`test/verify-artifact-invariant.property.test.ts`
    - fast-check 生成随机 baseline/treatment 捕获结果，断言 `verdict === "VERIFIED"` 时 baseline/ 和 treatment/ 目录非空
    - 引用：[R13.4]
  - [x] 4.2 GREEN：实现 `src/verify.ts` 的 `runVerify()`
    - 步骤：(1) acquireFileLock `.forge/.locks/<topic>.lock` (2) 写 claim.md (3) resolveBaseline (4) 捕获 artifacts (5) 写 diff (6) 构造 Evidence_Chain (7) 写 verdict.md (8) releaseFileLock
    - 任一必需字段缺失 → INCONCLUSIVE [R1.3, R1.6]
    - 引用：Design §4.1
  - [x] 4.3 集成测试 `test/verify-inconclusive-paths.test.ts`
    - 覆盖：claim 字段缺失 / baseline 解析失败 / artifact 捕获失败 / 首次运行无 baseline [R14.9]
    - 引用：[R1.3, R1.6, R14.9]

- [x] 5. `/forge verify` 命令注册
  - [x] 5.1 修改 `commands/forge.md`，新增 `/forge verify <topic>` 子命令定义
    - 参数规范：`<topic>` 必填，`--baseline <git-ref>` 可选
    - 引用：[R1.11]，Design §6.1
  - [x] 5.2 修改 `src/agent-registry.ts` 或 `src/skill-loader.ts`，注册 `forge-verify` SKILL 名称
    - 运行 `npm run check` 确认 router 能识别
    - 引用：Design §6.1

- [x] 6. quality-check 追加 deslop 维度
  - [x] 6.1 修改 `.claude/agents/quality-check.md`
    - 在 prompt 末尾追加"维度 7: deslop"章节（见 Design §4.2 的完整 markdown 片段）
    - 含 4 类模式定义、severity 映射、evolution_marker 触发规则、失败降级 `deslop: skipped`
    - 引用：[R2.1, R2.2, R2.5, R2.6, R2.7]
  - [x] 6.2 修改 SKILL contract 测试 `test/contract.skills.test.ts`
    - 断言 quality-check 的 Severity/File/Issue/Suggestion 4 列 schema 不变 [R2.4]
    - 引用：Design §2.2

- [x] 7. rules/ 目录 + 3 条起始规则
  - [x] 7.1 创建根目录 `rules/` 与 3 个文件：`typescript-exhaustive-switch.md`、`no-inline-imports.md`、`no-any-cast.md`
    - 每个文件按 Design §3.4 的 frontmatter schema
    - `alwaysApply: true`、`lint_binding` 按实际 Biome/ESLint 规则填
    - 引用：[R3.1, R3.2, R3.3]
  - [x] 7.2 实现 `src/rules-loader.ts`
    - 签名：`loadAllRules(rulesDir?): Promise<AtomicRule[]>`、`renderSuggestionSuffix(rule): string`
    - 缺失 frontmatter 字段时跳过并告警（不抛错）[R3.8]
    - 引用：Design §4.3
  - [x] 7.3 RED：`test/rules-loader-roundtrip.property.test.ts`
    - 生成任意合规 rule frontmatter → 解析 → 序列化 → 再解析，断言等价
    - 引用：[R13.5]
  - [x] 7.4 集成测试 `test/rules-loader-starter-set.test.ts`
    - 确认 3 条起始规则都能被 loader 正确加载
    - 引用：[R3.3]
  - [x] 7.5 修改 `scripts/init.sh`
    - 在 TypeScript 栈检测后增加 rules 安装块（见 Design §4.3 的 shell 片段）
    - 既存同名规则不覆盖
    - 引用：[R3.4]
  - [x] 7.6 修改 `.claude/agents/quality-check.md`，在 session start 读 `rules/*.md` 并检查 alwaysApply=true 的规则
    - 违规时 Suggestion 列引用 lint_binding [R3.7]
    - 引用：[R3.6, R3.7]，Design §4.2

- [x] 8. Sprint 1 回归与 README 更新
  - [x] 8.1 运行 `npm run check` 全量通过
  - [x] 8.2 README.md 更新：
    - "13 个 SKILL" → "14 个 SKILL"（forge-verify 加入）
    - 测试总数从 3526 增至新值
    - 新增 `rules/` 目录说明章节
    - 引用：Design §11.3

---

## Sprint 2 — HTML 评审画布 + 秘密脱敏（≈ 2 天）

- [x] 9. secret-redactor.ts（基础设施优先）
  - [x] 9.1 RED：`test/secret-redactor.test.ts`
    - 覆盖 4 种泄漏形态：Bearer token / JSON "token" 字段 / env 变量 / 自定义鉴权头
    - 每种至少 5 个用例
    - 引用：[R12.11]，Design §5.1
  - [x] 9.2 GREEN：实现 `src/secret-redactor.ts`
    - 导出 `redactSecrets(text: string): string`
    - 4 条正则按 Design §5.1 定义
    - 引用：Design §5.1

- [x] 10. bitbucket-mcp-adapter.ts（可选 enrichment 层）
  - [x] 10.1 实现 `src/bitbucket-mcp-adapter.ts`
    - 签名：`tryFetchEnrichment(topic): Promise<BitbucketEnrichment | null>`
    - 10 秒连接超时 + 15 秒响应超时 [R14.1, R14.2]
    - 所有返回字段经 `redactSecrets` 处理
    - 超时/错误统一返回 `null`，调用方按"missing enrichment"处理
    - 引用：Design §4.4
  - [x] 10.2 集成测试 `test/canvas-bitbucket-degradation.test.ts`
    - 模拟 Bitbucket MCP 不存在 / 返回 401 / 返回 500 / 超时四种情形
    - 断言：adapter 返回 null，canvas 仍产出完整 HTML [R4.3, R14.1, R14.2]

- [x] 11. canvas-renderer.ts
  - [x] 11.1 创建 HTML 模板文件
    - `templates/canvas/base.html.tmpl`：含三栏 `<section>` 布局、JSON island、script 引用
    - `templates/canvas/styles.css`：暗色主题
    - `templates/canvas/renderer.js`：使用 DOMParser 读 JSON island，实现折叠 / 伪代码卡片
    - 注意：所有来自 Cursor 模板的代码都加归属注释
    - 引用：[R4.4, R4.10]，Design §4.4
  - [x] 11.2 RED：`test/canvas-xss-safe.property.test.ts`
    - fast-check 生成任意 finding text（含 `<script>`、`</script>`、`<img onerror>` 等）
    - 断言：渲染后的 HTML 中无活动的 `<script>` 源自用户文本（用 DOMParser 解析后检查）
    - 引用：[R13.8]
  - [x] 11.3 GREEN：实现 `src/canvas-renderer.ts`
    - 签名：`renderCanvas(opts: CanvasOptions): Promise<CanvasResult>`
    - 读取本地 3 数据源（reviews / diff / log）；调用 bitbucket-mcp-adapter 尝试 enrichment
    - JSON.stringify + HTML-escape `<>&` 再注入 JSON island [R4.8]
    - reviews 文件缺失时抛错并提示先运行 review [R4.7]
    - Bitbucket 失败时写 `.forge/findings/<topic>/canvas-errors.log` + footer notice [R14.2]
    - 引用：Design §4.4
  - [x] 11.4 集成测试 `test/canvas-renderer.integration.test.ts`
    - 准备 fixture：完整 review + diff + log，运行 renderCanvas，断言生成的 HTML 含三栏 + JSON island + 正确的 finding text
    - 测量耗时 < 5 秒（50 文件 / 5000 行 diff 的 fixture）[R4.9]
    - 引用：[R4.1, R4.4, R4.7, R4.9]
  - [x] 11.5 空 reviews 场景测试 `test/canvas-empty-reviews.test.ts`
    - 文件存在但无 findings → HTML 中显示 "no findings" 占位 [R14.5, R14.7]

- [x] 12. forge-review --canvas flag
  - [x] 12.1 修改 `skills/forge-review/SKILL.md`
    - 新增 `--canvas` flag 说明（不改外部契约 [§ 11.1]）
    - 引用：[R4.1]，Design §6.1
  - [x] 12.2 创建 `skills/forge-review/references/canvas.md`
    - 含 Cursor 归属说明 [R4.10]
    - 引用：Design §4.4

---

## Sprint 3 — CLI / UI 验证套件（≈ 3 天）

- [x] 13. harness-detector.ts（共用 tier 检测）
  - [x] 13.1 实现 `src/harness-detector.ts`
    - `detectCmuxAvailable()`：读 `$CMUX_WORKSPACE_ID` + 检查 `/tmp/cmux.sock` 存在，1 秒超时 [R14.3, R14.4]
    - `detectTmuxAvailable()`：`which tmux` 是否存在
    - `detectProjectHarness(kind)`：glob 项目中已有测试文件
    - 引用：Design §4.5

- [x] 14. forge-control-cli SKILL + 适配器
  - [x] 14.1 创建 `skills/forge-control-cli/SKILL.md`（≤ 3072 bytes）+ `references/tmux-harness.md` / `cmux-harness.md` / `node-pty-fallback.md`
    - 引用：[R12.2]，Design §4.5
  - [x] 14.2 实现 `src/harness-cmux.ts`
    - 通过 cmux CLI 或 Unix socket 发送 `send-text` / `send-key` / `capture-pane` 等价操作
    - 超过 5 秒时每 5 秒调 `set-progress` / `log` / `notify` [R5.4]
    - 引用：Design §4.5
  - [x] 14.3 实现 `src/harness-tmux.ts`
    - 通过 `child_process.spawn('tmux', ...)` 发命令
    - 引用：Design §4.5
  - [x] 14.4 实现 `src/harness-pty.ts`
    - 使用 `node:child_process` spawn + pipe 作为最后兜底
    - 可选 `require('node-pty')` guarded import（若用户项目已装）[R5.9]
    - 引用：Design §4.5
  - [x] 14.5 实现 `src/cli-harness.ts` orchestrator
    - 按 4 级优先级调用 harness-detector 和各 tier 适配器 [R5.2]
    - 写产物到 `.forge/findings/<topic>/cli-harness/` [R5.3]
    - verdict.md 按 Three_State_Verdict schema [R5.5]
    - 所有 tier 都失败 → INCONCLUSIVE 并记录 controllers attempted [R5.8]
    - 引用：Design §4.5
  - [x] 14.6 集成测试 `test/cli-harness-tier-selection.test.ts`
    - 模拟各种环境组合：有项目 harness / 仅 cmux / 仅 tmux / 仅 PTY / 全无
    - 验证正确选择 tier 并降级
    - 引用：[R5.2, R5.6, R5.8]

- [x] 15. forge-control-ui SKILL + 适配器
  - [x] 15.1 创建 `skills/forge-control-ui/SKILL.md`（≤ 3072 bytes）+ `references/cmux-browser.md` / `playwright-adapter.md` / `cdp-adapter.md`
    - 引用：[R12.2]，Design §4.6
  - [x] 15.2 实现 `src/harness-cmux-browser.ts`
    - 调用 cmux 的 `browser snapshot --interactive --compact`、`screenshot`、`console list`、`errors list`、`state save/load`、`wait --function`
    - 引用：[R6.4]，Design §4.6
  - [x] 15.3 实现 `src/harness-playwright.ts`
    - 使用 `require('playwright')` guarded import（仅项目 devDep 已装时生效）[R6.5]
    - 严禁添加 playwright 到 Forge 自己的 package.json
    - 引用：Design §4.6
  - [x] 15.4 实现 `src/harness-cdp.ts`
    - 通过 Chrome DevTools Protocol WebSocket 连接用户手动启动的 Chrome
    - 引用：Design §4.6
  - [x] 15.5 实现 `src/ui-harness.ts` orchestrator
    - 4 级 tier 检测 [R6.2]
    - designer spec 存在时生成 UI 断言并执行 [R6.6]
    - 不一致写 `.forge/findings/<topic>/ui-harness/mismatches.md`（Severity/File/Issue/Suggestion schema）[R6.6]
    - 全部 tier 失败 → INCONCLUSIVE [R6.8]
    - 引用：Design §4.6
  - [x] 15.6 修改 `.claude/agents/quality-check.md`
    - session start 额外读 `.forge/findings/<topic>/ui-harness/mismatches.md` 并作为行加入 Layer 2 输出 [R6.6]
    - 引用：Design §4.2、§4.6
  - [x] 15.7 集成测试 `test/ui-harness-tier-selection.test.ts`
    - 覆盖 4 级 tier + designer spec → mismatches 链路
    - 断言 Forge 自己 package.json 未新增 browser 依赖 [R6.5]

- [x] 16. forge-test --cli flag
  - [x] 16.1 修改 `skills/forge-test/SKILL.md`
    - 新增 `--cli` flag 触发条件：`package.json bin` 非空 OR `--cli` 显式 flag OR `.forge/config.md` `cli_harness: true` [R5.1]
    - 引用：[R5.1]，Design §2.3

- [x] 17. forge-loop-cli self-dogfooding e2e
  - [x] 17.1 创建 `test/e2e/forge-loop-cli.harness.test.ts`
    - 使用 CLI harness 驱动自己的 `forge-loop-cli.ts`
    - 验证三场景：SIGINT 优雅退出 / `--resume <branch>` 从中断点恢复 / worktree cleanup
    - 引用：[R5.7]，Design §8.3

---

## Sprint 4 — Forge 感知合并冲突（≈ 2 天）

- [x] 18. conflict-classifier.ts（纯函数，TDD）
  - [x] 18.1 RED：`test/conflict-classifier-totality.property.test.ts`
    - fast-check 生成任意 UTF-8 路径（1-4096 字节），断言 `classify(path) ∈ {"frozen", "guarded", "open", "source"}`
    - 200 次迭代
    - 引用：[R13.1]
  - [x] 18.2 RED：`test/conflict-classifier-normalize.property.test.ts`
    - 生成任意路径，断言 `classify(normalize(p)) === classify(p)`
    - 其中 normalize = strip trailing slashes → strip leading `./`
    - 引用：[R13.2]
  - [x] 18.3 GREEN：实现 `src/conflict-classifier.ts`
    - `classify(path: string): Zone` 按优先级：frozen → guarded → open → source [R7.1]
    - `normalizePath(p: string): string` 明确两步顺序
    - frozen 判定需解析 YAML frontmatter status 字段 [R7.3]
    - 引用：Design §4.7
  - [x] 18.4 Fixture 测试 `test/conflict-classifier.fixtures.test.ts`
    - 手工准备 ≥ 80 个路径 fixture（≥ 20 per zone × 4 zones） [R7.13]
    - 引用：[R7.13]

- [x] 19. guarded-merger.ts
  - [x] 19.1 实现 `mergeProgressFile(ours, theirs)` [R7.6]
    - 按 task_id 合并；completed > pending；tie-break 用最新 completed_at；再 tie 取 ours
    - 引用：Design §4.7
  - [x] 19.2 实现 `mergeInstinctsOrFailures(ours, theirs)` [R7.7]
    - 按 pattern_id / failure_id 合并；confidence = max；occurred_count = sum；单侧条目 verbatim 保留
    - 引用：Design §4.7
  - [x] 19.3 实现 `mergeReviewsFile(ours, theirs)` [R7.9]
    - 追加两侧条目；按 (layer, severity) 排序
    - 引用：Design §4.7
  - [x] 19.4 实现 `reassignAdrId(theirs, nextId)` [R7.8]
    - 复用 `src/adr-registry.ts` 的 `nextAdrId()`；同步更新 `adr-index.md`
    - 引用：Design §4.7
  - [x] 19.5 集成测试 `test/fix-conflicts-guarded-merge.test.ts`
    - 覆盖 4 类 guarded 文件的合并
    - 引用：[R7.6–R7.9]

- [x] 20. forge-fix-conflicts SKILL
  - [x] 20.1 创建 `skills/forge-fix-conflicts/SKILL.md`（≤ 3072 bytes）+ `references/zone-classification.md` / `guarded-merge-rules.md` / `frozen-refusal-flow.md`
    - 引用：[R12.2]
  - [x] 20.2 实现冻结区三选项流程 [R7.3, R7.4, R7.5]
    - "manual resolve"：保留 worktree/index 状态，指示手动编辑
    - "unlock then merge"：改 status 为 `draft` + 写 `.forge/debug/unlock-<ts>.md` + 三路合并
    - "abort merge"：调 `git merge --abort` 或 `git rebase --abort`
    - 引用：Design §4.7
  - [x] 20.3 实现 validation gate + Three-Strike 计数
    - 合并后跑 `npm run check`（fallback 到 `.forge/config.md` `ci_check_command`）[R7.11, R14.11, R14.12]
    - 用户改过文件算新尝试，未改文件的重跑不增计数 [R7.12]
    - 3 连失败触发 `/forge debug` [R7.12]
    - 引用：Design §4.7
  - [x] 20.4 集成测试 `test/fix-conflicts-frozen-refuse.test.ts`
    - 模拟冻结区冲突 → 三选项路径 × 3 [R7.3, R7.4, R7.5, R14.8]
  - [x] 20.5 集成测试 `test/fix-conflicts-three-strike.test.ts`
    - 模拟 3 次不同文件变更后仍失败 → `/forge debug` 触发 [R7.12]

---

## Sprint 5 — Post-push verify + Recap + From-chats + Background（≈ 2 天）

- [x] 21. forge-ship Post_Push_Verify（≤ 50 行扩展）
  - [x] 21.1 修改 `src/ship.ts`，追加 `executePostPushVerify(topic, prCreated)` 函数
    - 跑 `npm run check`（fallback 到 `ci_check_command`）+ 600 秒超时 [R8.1, R14.11, R14.12]
    - 失败 → 写 `.forge/ship/<topic>-post-push-verify.md`（schema 按 Design §3.2.4）[R8.2]
    - 成功 → 仅 stdout 一行，不创建 artifact [R8.5]
    - 有 Bitbucket MCP + PR 刚被创建 → 调 `add_comment` [R8.3]
    - 函数体 ≤ 50 行代码 [R8.6]
    - 引用：Design §4.8
  - [x] 21.2 修改 `skills/forge-ship/SKILL.md`
    - 追加 §4.3 Post_Push_Verify 章节（≤ 20 行）
    - 引用：Design §4.8
  - [x] 21.3 集成测试 `test/ship-post-push-verify.test.ts`
    - 覆盖：通过 / 失败 / 超时 / 无 npm run check / Bitbucket MCP 存在与不存在
    - 引用：[R8.1, R8.2, R8.5, R14.11, R14.12]
  - [x] 21.4 修改 `.forge/config.md`（当前仓库）+ `templates/config.md`
    - 新增 `.forge/ship/` 为 Open_Zone [R8.7]
    - 新增 `post_push_verify_enabled`（默认 true）、`ci_check_command`（默认 null）字段定义
    - 保持 optional，向后兼容 [R12.8]
    - 引用：Design §3.3

- [x] 22. forge-recap SKILL + src/recap.ts
  - [x] 22.1 创建 `skills/forge-recap/SKILL.md`（≤ 3072 bytes）+ `references/data-sources.md` / `category-heuristics.md`
    - 引用：[R12.2]
  - [x] 22.2 RED：`test/recap-idempotent.property.test.ts`
    - 生成固定 fixture（固定 git log + sessions + runs），连续两次调用 `runRecap("7d")`，断言输出（排除 decided_at）字节相同
    - 引用：[R13.6]
  - [x] 22.3 GREEN：实现 `src/recap.ts`
    - 签名：`runRecap(window: string): Promise<RecapReport>`
    - 解析 `--since 1d` / `--since 7d` / `--since <YYYY-MM-DD>..<YYYY-MM-DD>` [R9.1]
    - 合并 3 数据源 [R9.2]
    - 分 5 类 + `uncategorized` fallback [R9.3]
    - 扫 evolved-rules.md 过期规则（> 5 Session_Boundary）[R9.4]
    - git email 缺失 → 降级 + stderr 告警 [R9.5]
    - 引用：Design §4.9
  - [x] 22.4 修改 `commands/forge.md`，注册 `/forge recap` 子命令
    - 引用：[R9.1]

- [x] 23. forge-learn --from-chats
  - [x] 23.1 创建 `skills/forge-learn/references/from-chats.md`（新 reference 文件，保持 SKILL.md 3 KB 内）
    - 引用：[R10.8]
  - [x] 23.2 RED：`test/chat-extractor-dedup.property.test.ts`
    - 生成任意两个 transcript 包含相同 trigger + decision_rule 的 atom，断言去重为单一 candidate
    - 引用：[R13.7]
  - [x] 23.3 GREEN：实现 `src/chat-preference-extractor.ts`
    - 签名：`runFromChats(opts): Promise<FromChatsResult>`
    - 扫描 `.claude/` transcripts 窗口内 [R10.1]
    - 抽 PreferenceAtom 7 字段 [R10.2]
    - 按阈值分 4 级 confidence [R10.3]
    - strong → 写 `evolved-rules.md`（经现有 15-rule cap）[R10.4]
    - interactive 模式：weak/contradicted 交互确认
    - autonomous 模式：weak/contradicted 丢弃并记 `from-chats-skipped.log` [R10.5]
    - 拒绝 task-specific 候选（路径/PR#/task id 正则匹配）[R10.6]
    - 空目录/空窗口 → "no transcripts in window" 正常退出 [R10.7]
    - 引用：Design §4.10
  - [x] 23.4 修改 `skills/forge-learn/SKILL.md`
    - 新增 `--from-chats` flag 说明（仅路由文本，≤ 3072 bytes）[R10.8]
    - 引用：Design §2.3
  - [x] 23.5 集成测试 `test/from-chats-confidence.test.ts`
    - 覆盖 4 级 confidence 分类、task-specific 拒绝、interactive/autonomous 分支
    - 引用：[R10.3, R10.4, R10.5, R10.6]

- [x] 24. Background subagent 实验
  - [x] 24.1 修改 `.claude/agents/quality-check.md` frontmatter
    - 追加 `background: true`；`model: sonnet` [R11.1, R11.3]
    - 引用：Design §4.11
  - [x] 24.2 修改 `.claude/agents/security-check.md` frontmatter
    - 追加 `background: true`；保持 `model` 为现有值 [R11.1]
    - 引用：Design §4.11
  - [x] 24.3 修改 `.claude/agents/spec-check.md`
    - 确认**不**含 `background: true` [R11.2]
    - 引用：Design §4.11
  - [x] 24.4 修改 `skills/forge-review/SKILL.md`
    - 追加"Background Subagent 注意事项"章节，含权限预批 / Ctrl+B fallback / 旧版 Claude Code 兼容说明
    - 引用：[R11.4, R11.5, R11.7]
  - [x] 24.5 修改 forge-review fan-in 逻辑
    - 背景 Subagent 失败标记为 `failed`，非 abort；保持 Markdown 输出 schema 不变 [R11.6, R11.7]
    - 引用：Design §4.11

- [x] 25. 横切关注点收尾
  - [x] 25.1 `.forge/config.md` 新增 `findings_retention_days`（默认 30）+ `templates/config.md` 同步 [R12.12]
  - [x] 25.2 `scripts/prune-event-logs.sh` 扩展到 `.forge/findings/`
    - 按 `findings_retention_days` 清理；失败不阻塞活跃 run [R12.12]
    - 引用：Design §5.3
  - [x] 25.3 i18n 批量补全
    - 扫描所有新 SKILL.md 的 user-visible 字符串
    - 在 `locales/zh.json` 和 `locales/en.json` 同步新增 key [R12.6]
    - 运行 `test/translation-parity.test.ts` 确认两 locale 一致
    - 引用：Design §5.6
  - [x] 25.4 README.md 更新
    - SKILL 数 13 → 18
    - 测试统计更新为新数字
    - 新增 `/forge verify` / `/forge recap` 命令速查表条目
    - 新增 `rules/` 说明
    - 引用：Design §8.4、§11.3
  - [x] 25.5 CHANGELOG.md 更新
    - 列出所有 R1–R14 对应的 breaking change 说明（本特性无 breaking change，但新增 opt-in 能力需文档化）
    - 引用：Design §11

---

## 最终验收

- [x] 26. 全量回归
  - [x] 26.1 `npm run check` 通过
  - [x] 26.2 `npm run docs` 通过（typedoc）
  - [x] 26.3 `bash scripts/build-dist.sh` 通过（分发包含所有新 SKILL 的 references 与 templates）
  - [x] 26.4 `bash scripts/validate-skill-descriptions.sh` 通过
  - [x] 26.5 `bash scripts/validate-skill-length.sh` 通过（5 个新 SKILL.md 均 ≤ 3072 bytes）
  - [x] 26.6 CI 流水线全绿
  - [x] 26.7 测试覆盖率不低于现有水平（目标 ≥ 89% statement）

- [x] 27. Acceptance Criteria 追溯矩阵
  - [x] 27.1 创建 `.forge/specs/cursor-team-kit-integration/acceptance-matrix.md`
    - 每条 R1–R14 的 AC 列出对应的实现任务号 + 测试文件名
    - 作为发布前 review 检查清单
