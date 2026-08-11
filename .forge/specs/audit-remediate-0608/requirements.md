---
status: completed
feature: audit-remediate-0608
layout: requirements
created: 2026-06-08
tier: standard
import_source: "项目审核报告_0608.md"
health:
  score: 0
  verdict: "pending"
---

# Requirements — Audit Remediate 0608

## 目标

修复 2026-06-08 项目审核报告中经源码核实确认的 7 项问题（3×P1 + 1×P1-coverage + 3×P2），使 `npm run check` exit 0，测试隔离不污染真实仓库状态，ship gate 安全语义与项目宪法一致。

## 非目标

- 不处理 WorkNature 路由接入生产（Issue 5 的"接入"部分）— 需要 workflow graph DSL 设计，延后到 follow-up
- 不重构 MCP script mode 为仅允许 structured operation（Issue 7 的"移除"部分）— 需要 API 兼容性评估
- 不改动 ship gate 的 forceSkipReview 完全移除路径 — 仅加固审计耦合
- 不改动非审核范围内的代码

---

## REQ-01: 测试隔离修复 — fallback-ladder 使用真实 .forge/reviews/（P1）

**当** `test/review/fallback-ladder.test.ts` 的 `tempDir` 使用 `process.cwd()/.forge/reviews/` **则** 真实评审文件在 `afterEach` 的 `rmSync` 中被删除。

**当** 修复后运行 `npx vitest run test/review/fallback-ladder.test.ts` **则** 该测试使用 `tmpdir()` 创建隔离目录，不触碰真实 `.forge/reviews/`。

**当** 修复后运行 `npm test` **则** 已有的 `.forge/reviews/*.md` 文件保持不变。

**Verify-By**: vitest
**Evidence**: 运行测试前后 `.forge/reviews/` 目录内容不变；`grep -n "process.cwd()" test/review/fallback-ladder.test.ts` 无匹配

**Current State**: `test/review/fallback-ladder.test.ts:17` 使用 `join(process.cwd(), ".forge", "reviews")`；`afterEach` (line 61) 执行 `rmSync(tempDir, { recursive: true, force: true })`。项目其他测试均正确使用 `tmpdir()`。

**Proposed Change**:
- 将 `tempDir` 改为 `join(tmpdir(), "forge-fallback-ladder-test-" + randomUUID())`
- `beforeEach` 创建隔离 temp 目录
- `afterEach` 删除隔离 temp 目录

**明确不改变**: 测试逻辑本身（fallback ladder 行为验证），仅修正目录路径

---

## REQ-02: Ship forceSkipReview 审计耦合加固（P1）

**当** `checkShipGateWithForceSkip()` 返回 `allowed: true` 且 `forceSkipped: true` **则** `recordForceSkip()` 已被自动调用（编程绑定，非依赖 skill instructions）。

**当** `recordForceSkip()` 写入失败（磁盘满/权限不足）**则** `checkShipGateWithForceSkip()` 仍返回 `allowed: true` 但 `reasons` 包含审计失败警告。

**当** 审计文件被篡改（内容被清空）**则** 下次 ship 可通过 `.forge/findings/force-skip-review-*.md` 的存在性检测发现异常。

**Verify-By**: vitest
**Evidence**: 测试验证 `checkShipGateWithForceSkip(forceSkip=true)` 返回结果时审计文件已写入磁盘

**Current State**: `src/ship.ts:258-275` `checkShipGateWithForceSkip()` 短路所有门禁直接返回 `allowed: true`。`recordForceSkip()` (lines 284-297) 为独立函数，与 gate 函数无编程耦合。审计是否记录完全依赖 skill instructions 被正确执行。

**Proposed Change**:
- `checkShipGateWithForceSkip()` 内部在返回前调用 `recordForceSkip()`
- `recordForceSkip()` 调用包裹在 try-catch 中，失败时追加 warning 到 `reasons`
- 新增 `commitHash` 参数（gate 函数已有足够上下文推断）
- 保留 `forceSkipped: true` 标记供下游检测

**明确不改变**: forceSkipReview 的触发条件（仍为 CLI flag）、reason 必填约束、审计文件格式

---

## REQ-03: Stale review 升级为 ship blocker（P1）

**当** review 后代码发生非 `.forge/` 文件变更 **则** `checkShipGateWithFreshness()` 返回 `allowed: false`。

**当** review 后仅 `.forge/` 目录内文件变更 **则** 视为 fresh，不阻断 ship。

**当** review 无 `reviewedAtCommit` 记录 **则** 保持向后兼容（视为 fresh）。

**当** 用户显式 `forceSkipReview` **则** stale review 不阻断（force skip 已由 REQ-02 加固审计）。

**Verify-By**: vitest
**Evidence**: 测试覆盖 4 种 freshness 场景（无 commit → fresh，commit 一致 → fresh，仅 .forge/ 变更 → fresh，非 .forge/ 变更 → blocked）

**Current State**: `src/ship.ts:333-352` `checkShipGateWithFreshness()` 对非 fresh 情况仅追加 `result.reasons`，JSDoc 明确声明 "This does NOT block ship — it is advisory only"。`checkReviewFreshness()` (lines 161-185) 正确检测 4 种场景但返回值仅用于 warning。

**Proposed Change**:
- `checkShipGateWithFreshness()` 在 `!freshness.fresh` 时设置 `result.allowed = false`
- JSDoc 更新为 "Blocks ship when review is stale due to non-.forge/ code changes"
- 保留 warning 信息在 `result.reasons` 中（含变更文件列表）

**明确不改变**: freshness 检测逻辑（`checkReviewFreshness()` 函数不变）、`.forge/` 文件排除规则

---

## REQ-04: Branch coverage 达标（P1）

**当** 运行 `npm run test:coverage` **则** exit 0（branches ≥ 79%）。

**当** `test/workflow-naming.test.ts` 运行 **则** 该测试通过（`multi-agent-review.js` 断言与实际文件一致）。

**Verify-By**: bash
**Evidence**: `npm run test:coverage` exit 0

**Current State**: branch coverage 78.99%，低于 vitest.config.ts 阈值 79%。同时 `test/workflow-naming.test.ts` 断言 `multi-agent-review.js` 不应存在但文件存在导致测试失败。

**Proposed Change**:
- 修复 `test/workflow-naming.test.ts`：将 `multi-agent-review.js` 从 "不应存在" 断言中移除（该文件为实验性 workflow，存在合理），或根据 workflow-fallback-ladder.md 规则确认该文件是否应重命名
- 补充覆盖缺口使 branches ≥ 79%

**明确不改变**: vitest.config.ts 阈值（保持 79%）、其他测试逻辑

---

## REQ-05: Spec 可测试性校验强化（P2）

**当** spec 场景只包含 `当...则...` 格式 **则** `validateTestability()` 额外校验：场景包含至少一个可识别的触发条件描述、预期结果描述、可验证对象。

**当** 场景格式不满足 `当...则...` **则** 校验仍通过（向后兼容），但跳过增强校验。

**当** 场景通过增强校验 **则** 其结构至少包含触发（当/如果/给定）+ 结果（则/应该/预期）+ 可验证元素（断言关键词或度量）。

**Verify-By**: vitest
**Evidence**: 测试覆盖 — 合格场景通过、缺少预期结果的场景拒绝、纯描述性场景拒绝、非 当...则... 格式向后兼容

**Current State**: `src/spec.ts:189` 仅使用 `/当.+则.+/` 单一 regex 判断场景可测试性，无法保证 EARS 语义或内容质量。

**Proposed Change**:
- 保留 `/当.+则.+/` 作为格式识别入口
- 新增结构化校验：触发条件（当/如果/给定 关键词后跟具体描述）、预期结果（则/应该/预期 关键词后跟具体描述）、可验证对象（包含可度量断言如 "返回/等于/包含/不存在/exit 0"）
- 校验失败返回具体原因（非 boolean）

**明确不改变**: spec 整体验证流程（validateTestability 调用位置不变）、现有通过的场景不受影响

---

## REQ-06: MCP legacy script mode deprecation 警告（P2）

**当** 用户通过 `forge_read` 的 script language 模式提交脚本 **则** 返回结果中包含 deprecation 警告：`⚠️ Script mode is deprecated. Use structured operations (imports/contains/line_count/json_keys) instead.`

**当** 用户使用 structured operation 模式 **则** 无 deprecation 警告。

**当** deprecation 警告存在 **则** 工具仍正常执行（不阻断，仅提示）。

**Verify-By**: vitest
**Evidence**: 测试验证 script 模式返回内容包含 deprecation 字符串，structured 模式不包含

**Current State**: `src/mcp/tools/forge-read.ts` 有 `DANGEROUS_SCRIPT_PATTERNS` deny-list（28 条 regex），script mode 正常执行无任何提示。structured operation 已作为推荐路径存在。

**Proposed Change**:
- 在 `validateScript()` 通过后的执行路径中追加 deprecation 警告到返回内容的 `content` 数组
- 警告为 `type: "text"` 的附加内容条目（不影响主结果）
- 在 `DANGEROUS_SCRIPT_PATTERNS` 注释中标注 `@deprecated since 2026-06`

**明确不改变**: script mode 执行逻辑、deny-list 规则、structured operation 行为

---

## 反漂移信号

- **主目标**: `npm run check` exit 0 + 0 P1 残留 + 测试隔离无副作用
- **非目标代理**: 对 ship gate 语义的独立修改、对 MCP script mode 的独立移除
- **验证材料角色**: 审核报告核实结果 → 本规格 → plan → build → review

## 回滚清单

- 每个 REQ 独立提交，可 `git revert` 单个
- 测试文件修改可独立回滚
- ship.ts 变更涉及两个 REQ（REQ-02 和 REQ-03），需注意合并回滚
