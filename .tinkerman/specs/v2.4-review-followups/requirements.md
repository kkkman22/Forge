---
status: retired-partial
status_note: "受 forge-loop-native-fusion 影响而关闭：需求 2（E2E）N/A — 目标架构已被删除。需求 3（src/internal/）需独立 spec。需求 4 branches 覆盖率从 79.88% 提升到 80.83%（+363 测试，7 个批次覆盖 25+ 文件的纯函数分支），但未达 85% 目标（剩余 gap ~410 branches 分散在 35+ 文件，每个 5-10 branches，需多次会话专项冲刺）。阈值保持 79（不降门禁）。需求 1/5/6/7/8 已验证满足。"
feature: v2.4-review-followups
layout: requirements
created: 2026-05-07
tier: standard
---
# 需求文档：v2.4 技术评审后续（v2.4 Review Follow-ups）

## 简介

基于 `forge-v2.3-technical-review.md`（2026-05-07 Kiro/Claude Opus 4.7 对 forge-loop@2.3.0 的深度技术评审）收敛出 v2.4 周期内必须落地的工程修复。评审综合评分 7.9/10，识别出 10 条风险项（R1-R10）与 12 条优先级改进（P0-P2）。本 spec 聚焦评分维度中**最薄弱的两条线**：

1. **安全/生产就绪**中的 `bypassPermissions` + PreToolUse Hook 单点信任假设（评审 R1，严重度：高）
2. **测试与 CI** 中的整合/端到端缺口与覆盖率门禁偏低（评审 R4、R7）

并顺带处理 3 条影响 semver/可维护性的中高优先级项（R3 公共 API 收敛、R6 console 迁移、R?/P2 orphan-detector 一致性、P2 plan 注入收敛、R5 SKILL-函数映射）。

**来源参考**：
- `forge-v2.3-technical-review.md` §7.1、§8、§9（主要来源）
- `forge-v2.3-executive-audit.md`（交叉验证）
- `.tinkerman/findings/dogfooding-observations.md` 发现 6「Context Window 压力」
- `.tinkerman/findings/skill-function-audit.md`（30 函数映射审计）

**非目标**（延后至 v2.5）：
- Claude Agent SDK 兼容层（评审 R8）
- 长文件拆分：`learn.ts / decide.ts / grill.ts / forge-loop-cli.ts`（评审 P2-10）
- bench 性能阻断门禁（评审 P2-11，需先稳定 bench 抖动基线）
- 英文文档翻译（独立 docs 工作流）

## 术语表

- **bypassPermissions**：Claude Agent SDK 的权限绕过模式，启用后 SDK 内建的交互式权限提示被关闭，依赖外部 hook 做访问控制
- **PreToolUse Hook**：Claude Code 在工具调用前执行的 shell/Node 脚本，非零退出码可阻断工具调用
- **fail-closed**：系统在检测到保护机制不可用时**默认拒绝**而非默认放行的安全姿态
- **E2E 测试**：端到端测试，覆盖真实环境下的完整链路（真实 git 仓库 + mock SDK）
- **公共 API 面（Public API Surface）**：`src/index.ts` barrel 向 npm 消费者暴露的符号集合，一旦发包即受 semver 约束
- **SKILL-函数映射**：SKILL.md 中提到的概念操作（如 "Merge_Review_Findings"）与 `src/*.ts` 中实际 exported 函数的对应关系

---

## 需求

### 需求 1：Hook 缺失 fail-closed 阻断（P0，来自评审 R1 / §9-1）

**用户故事**：作为 Forge 的运维者和安全审计者，我希望在 hooks 保护链失效时 forge-loop 默认拒绝启动，以便避免 `bypassPermissions` 在无保护状态下静默运行、绕过冻结区约束。

#### 验收标准

1. WHEN `SdkDriver.run()` 启动时调用 `validateHooksPresence(cwd)` 返回 `{ valid: false }`，THE SdkDriver SHALL 抛出 `ForgeError`（code: `HOOKS_PROTECTION_MISSING`）并在任何 agent 调用之前终止
2. THE 错误消息 SHALL 包含具体原因（`hooks/hooks.json not found` / `PreToolUse section missing in hooks.json` / `hooks.json parse failed`）与建议操作（例如"运行 `scripts/init.sh` 重新安装 hooks，或使用 `--force-no-hooks` 显式覆盖"）
3. WHEN 用户在 CLI 提供 `--force-no-hooks` flag，THE forge-loop CLI SHALL 允许 hooks 缺失继续运行，但必须在 stdout 与结构化日志中同时输出一条 `warn` 级警告横幅（含醒目标识），提示"保护链未生效"
4. WHEN `--force-no-hooks` 被使用时，THE 当次运行 SHALL 在 `.tinkerman/runs/<runId>/` 目录下写入一个 `force-no-hooks.flag` 文件，记录时间戳与 CLI 参数，供审计追溯
5. THE `hooks/hooks.json` 中 `PreToolUse` 的 `check-frozen` 命令 SHALL 在 Node 不在 PATH 或 `dist/src/check-frozen.js` 不存在时以 **exit 2** 显式终止，不得回退到 exit 127 或 exit 0
6. WHEN hooks 命令以 exit 2 终止，THE 终端输出 SHALL 包含原因提示（`Node not in PATH` 或 `check-frozen.js missing`），不得被 `2>/dev/null` 完全吞没
7. THE 新增一条属性测试 `sdk-driver.hooks-enforcement.property.test.ts`，验证：对任意 `SdkDriverConfig`，当 hooks 缺失且未启用 `--force-no-hooks` 时，`SdkDriver.run()` 必然在任何 agent 调用**之前**抛 `ForgeError`
8. THE `validateHooksPresence` 纯函数接口 SHALL 保持签名不变（仅调用侧策略改变）
9. THE 现有 `SdkDriver.run()` 中 `try/catch` + `warn` 分支 SHALL 被移除或改为 error 级阻断路径

---

### 需求 2：forge-loop 关键路径 E2E 测试（P0，来自评审 R4 / §9-2）

**用户故事**：作为 Forge 的贡献者，我希望 `forge-loop` 的 5 条核心运行路径有真实环境 E2E 测试，以便在重构 SdkDriver / EffectExecutor / RunManager 时不破坏端到端行为。

#### 验收标准

1. THE `test/e2e/` 目录 SHALL 作为 E2E 测试套件的存放位置，独立于现有 `test/` 下的 integration 测试
2. THE E2E 套件 SHALL 使用 **真实临时 git 仓库**（通过 `fs.mkdtemp` 创建）+ **mock Claude Agent SDK**（通过 `AgentInterface` 注入），不依赖网络或真实 SDK 调用
3. THE E2E 套件 SHALL 覆盖以下 5 条路径，每条路径独立测试文件：
   - **成功路径**（`e2e-success-path.test.ts`）：mock agent 声明 `iteration_success` → 触发 `commit` effect → `ship` → exit 0
   - **软失败路径**（`e2e-soft-failure.test.ts`）：单轮 `iteration_failure` → 触发 `start_backoff` + `schedule_iteration` → 下一轮成功 → exit 0
   - **硬失败路径**（`e2e-hard-failure.test.ts`）：连续失败达到熔断阈值 → 触发 `rollback` + `abort` → exit 非 0
   - **worktree 模式**（`e2e-worktree.test.ts`）：`--worktree` 创建隔离分支 → 运行完成 → 删除 worktree 前 `backupWorktreeNotes` 写入主仓库 `.tinkerman/runs/<runId>/notes.md`
   - **中断恢复路径**（`e2e-resume.test.ts`）：SIGTERM 中途终止 → StatusFile 含 `loop_run_id` → 重启 `forge-resume` 从 StatusFile 续跑至完成
4. THE 每条 E2E SHALL 至少包含两类断言：
   - **git 快照断言**：`git log --oneline` 输出包含预期 commit message 序列
   - **状态文件快照断言**：`.tinkerman/status.md` 或 `.tinkerman/runs/<runId>/notes.md` 内容匹配预期 frontmatter 字段
5. THE 每条 E2E 的墙钟时间 SHALL ≤ 60 秒（本地运行），通过 `testTimeout: 60000` 显式声明
6. THE E2E 套件 SHALL 在 `package.json` 新增独立脚本 `"test:e2e": "vitest run test/e2e/"` 与 `"test:e2e:watch": "vitest test/e2e/"`
7. THE CI pipeline SHALL 新增独立 `e2e` job，运行 `npm run test:e2e`，整体墙钟时间 ≤ 5 分钟
8. THE E2E job SHALL 在 PR 触发中运行，但**不阻断** `check` job 的并行度（独立依赖关系）
9. THE E2E 使用的 mock SDK SHALL 实现 `AgentInterface`，支持通过测试注入预编程的响应序列（成功/失败/无效输出）
10. THE E2E 测试失败时 SHALL 输出足够的诊断信息（临时 git 仓库路径、events.jsonl 内容、StatusFile 内容），不自动清理临时目录（由测试框架后置清理或 CI 上传 artifact）

> **⚠️ N/A — 2026-06-12 审计验证**
>
> 本需求的 5 条 E2E 测试路径全部依赖 `SdkDriver`、`EffectExecutor`、`RunManager` 三个核心类。
> 这三个类已被 `forge-loop-native-fusion`（2026-06-01）**刻意删除**，整个工作流编排架构被替换为原生 loop 模式。
>
> **现有实现**：`test/e2e/helpers/temp-repo.ts`、`test/e2e/helpers/snapshot.ts` 已创建（Task 4.1/4.3），`package.json` 的 `test:e2e` script 已存在（Task 4.9），`test/e2e/spec-kiro-style.test.ts` 作为不相关测试存在。
>
> **未实现（N/A）**：`mock-agent.ts`（Task 4.2）和 5 个 E2E 测试文件（Task 4.4-4.8）未创建。测试目标代码已不存在，创建这些测试等于测试幽灵代码。
>
> 如未来需要 E2E 覆盖当前架构，应基于 `phase-worker-runtime.ts` 新架构编写独立 spec。

---

### 需求 3：`src/index.ts` 公共 API 面收敛（P0，来自评审 R5 / §9-3）

**用户故事**：作为 `forge-loop` 的 npm 消费者与维护者，我希望对外暴露的公共 API 面最小化，以便未来重构时不受 semver 约束，避免把内部实现细节变成对外合约。

#### 验收标准

1. THE `src/internal/` 目录 SHALL 作为"跨模块但非对外"符号的存放位置（对 barrel 不可见）
2. THE 以下模块 SHALL 从 `src/index.ts` 的 barrel 中移除（保留原文件位置不动，仅调整 barrel 导出）：
   - `error-recovery` 的 23 个 exported 函数（除非有文档或 `examples/` 用例明确使用）
   - `pattern-stats`、`episode`、`orphan-detector`、`process-registry`、`status-resolver`
   - 其他仅被 `src/*` 内部相互调用的工具函数
3. THE `src/index.ts` SHALL 仅保留真正意图作为公共 API 的符号，判断标准：**文档中显式提及 + 至少一个 `examples/` 用例引用 + 至少一条 SKILL.md 引用**，三选二即可保留
4. THE `src/index.ts` 中每一个保留的 export SHALL 在其定义位置（源文件）添加 `@public` TSDoc 标注
5. THE 内部符号（不在 barrel 中）SHALL 在其定义位置添加 `@internal` TSDoc 标注
6. THE 新增 `scripts/check-public-api.mjs` 脚本，在 CI 中执行：
   - 校验 `src/index.ts` 中 export 的符号全部具备 `@public` TSDoc 标注
   - 校验 `@public` 标注的符号全部出现在 `src/index.ts` 的 barrel 中
   - 校验 `@internal` 标注的符号**不**出现在 barrel 中
7. THE 脚本 SHALL 集成到 `npm run check`（作为 `scripts/check-*.sh` 系列的一员）
8. WHEN v2.4.0 发布，THE `src/index.ts` export 数 SHALL 从 51 降至 ≤ 20
9. WHEN v2.4.0 发布，THE `typedoc` 生成的 `docs/api/` 目录体积 SHALL 减小 ≥ 40%（以字节数或文件数衡量）
10. THE 为现有 v2.3 已对外导出的符号保留一层 re-export 转发，在 TSDoc 中标记 `@deprecated Will be removed in v2.5. See migration guide.`，不进入 typedoc 文档生成
11. THE CHANGELOG `[BREAKING]` 条目 SHALL 列出所有移出 barrel 的符号，并链接迁移指南

---

### 需求 4：覆盖率门禁上调（P1，来自评审 R7 / §9-5）

**用户故事**：作为 Forge 的维护者，我希望覆盖率门禁与实际测试水位对齐，以便把"不会倒退"变成合约而非信誉。

#### 验收标准

1. THE `vitest.config.ts` 的 coverage 阈值 SHALL 更新为：
   - `statements` 80 → **90**
   - `branches` 70 → **85**
   - `functions` 80 → **90**
   - `lines` 80 → **90**
2. THE 阈值变更 SHALL 以"一次 PR + 主分支实测绿灯"的方式落地，不允许在覆盖率实际不足的情况下先降门禁
3. WHEN PR 覆盖率相对 main 分支倒退 ≥ 1%，THE CI SHALL 失败并在 PR 评论中附明细（倒退的文件列表）
4. THE 实际覆盖率数据 SHALL 在 `README.md` 中同步更新（现为 89.35 / 89.62 / 95.2），保留精确数字
5. THE `scripts/check-readme-metrics.sh` SHALL 校验 README 中的覆盖率数字与 `vitest run --coverage` 输出在 ±0.5% 公差内一致
6. WHEN CI 因覆盖率门禁失败，THE 错误消息 SHALL 明确指出不达标的维度与当前值

---

### 需求 5：SKILL ↔ 纯函数显式映射补齐（P1，来自评审 R3 / §9-6）

**用户故事**：作为 Forge 的使用者（AI agent 或人类开发者），我希望 SKILL.md 中提到的每个概念操作都能找到对应的显式函数调用说明，以便消除"SKILL 说要做 X 但不告诉我调用哪个函数"的对接断层。

#### 验收标准

1. THE `findings/skill-function-audit.md` 中标记为"⚠️ 概念引用"的 16 条 SHALL 全部被升级处理：
   - 选项 A：SKILL.md 补充显式函数名 + 导入路径（如 `src/review.ts` 的 `mergeReviewFindings` 函数）
   - 选项 B：判定为"仅概念表述不需实际函数"，在 audit 表中改标为"📝 文档语义"
   - 选项 C：判定为"该函数应废弃或合并"，在单独的 deprecation PR 中处理
2. THE `findings/skill-function-audit.md` 中标记为"❌ 未对接"的 2 条 SHALL 按上述三档分流决策后关闭
3. THE `scripts/check-skill-function-refs.sh` SHALL 扩展为两个模式：
   - **basic 模式**（当前行为）：校验 SKILL.md 中提及的函数存在于 src 中
   - **strict 模式**（新增）：`--strict` 标志额外校验 `skill-function-audit.md` 中所有 ✅ 标记的函数在至少一个 SKILL.md 中有具体调用示例（带导入路径或 `src/*.ts:函数名` 形式的引用）
4. THE `npm run check` SHALL 运行 `check-skill-function-refs.sh --strict`
5. WHEN v2.4.0 发布，THE `findings/skill-function-audit.md` 中 ✅ 标记的函数数 SHALL ≥ 20（从当前 0）
6. THE 本需求的完成 SHALL 不修改 `src/*.ts` 的函数签名（仅修改 SKILL.md 与 audit 文档）

---

### 需求 6：`console.*` → `logger` 迁移收尾（P1，来自评审 R6 / §9-7）

**用户故事**：作为 Forge 的可观测性维护者，我希望所有源文件的日志输出都统一走 `createLogEntry()` + `LogSink`，以便在结构化日志模式下不遗漏关键信号。

#### 验收标准

1. THE 以下 12 个源文件 SHALL 停止使用 `console.*`：`forge-loop-cli.ts`、`run-manager.ts`、`failure-sink.ts`、`mcp/server.ts`、`orphan-detector.ts`、`pua-state-manager.ts`、`sdk-status-helpers.ts`、`sdk-quality-helpers.ts`、`sdk-skill-detection.ts`、`check-frozen.ts`、`process-registry.ts`、`logger/log-sink.ts`
2. THE `src/logger/log-sink.ts` 作为根因文件 SHALL 优先迁移，其他文件可依次处理
3. THE CLI 入口文件（如 `forge-loop-cli.ts`）的**用户可见输出** SHALL 通过新增的 `ConsoleSink` 实现（接受 `LogEntry`，输出到 stdout/stderr），不得回到裸 `console.*`
4. THE 现有日志格式（text 模式）SHALL 保持向后兼容（相同事件的渲染结果与 v2.3 一致，便于用户截图对比）
5. THE `biome.json` SHALL 新增 `noConsole` 规则（作用域 `src/**`）
6. WHEN 源文件必须使用 `console.*`（如性能关键路径或未 bootstrap 的早期错误），THE 该处 SHALL 以 `// biome-ignore lint/suspicious/noConsole: <理由>` 显式豁免
7. THE `npm run lint` SHALL 在 `src/` 中 `console.*` 不带豁免时失败
8. THE 新增一条 CI 检查：`grep -rl "console\." src/` 返回非空时，必须与 biome-ignore 列表匹配

---

### 需求 7：`orphan-detector.ts` 改用 `execFileSync`（P2，来自评审 §7.2）

**用户故事**：作为代码审查者，我希望全仓 shell 命令调用遵循统一的 `execFileSync + argv` 模式，以便消除审查时的不一致负担并强化"禁止字符串拼 shell 命令"的纪律。

#### 验收标准

1. THE `src/orphan-detector.ts` SHALL 将 `execSync("ps -eo pid,ppid,etime,command")` 改为 `execFileSync("ps", ["-eo", "pid,ppid,etime,command"], { ... })`
2. THE 改动 SHALL 保持函数签名与返回值格式完全一致
3. THE 现有单元测试 SHALL 全部通过不需修改
4. THE 新增一条属性测试：给定任意合法的 ps 输出行（含各种边界：长命令、空命令、包含 tab/空格的命令），解析函数的输出稳定且不抛出
5. WHEN v2.4.0 发布，THE `grep -rn "execSync\b" src/` 返回结果 SHALL 为空（或仅含 `// biome-ignore` 豁免）
6. THE 新增一条 CI 检查：`src/` 中禁止使用 `execSync`（可加入 biome 或独立 shell 脚本）

---

### 需求 8：UserPromptSubmit hook 的 plan 注入收敛（P2，来自评审 §7.2）

**用户故事**：作为 Forge 用户，我希望每次 prompt 注入的 plan 上下文被限制在 token 预算内，以便避免 `.tinkerman/plans/` 膨胀时把大量无关 plan 的头部塞进每条 prompt。

#### 验收标准

1. THE `hooks/hooks.json` 中 `UserPromptSubmit` hook 的 `head -50 .tinkerman/plans/*.md` 命令 SHALL 被替换为调用 `scripts/inject-plan-context.mjs`
2. THE `scripts/inject-plan-context.mjs` 脚本 SHALL 具备以下行为：
   - 扫描 `.tinkerman/plans/*.md`，仅选取 frontmatter 中 `status: active` 的 plan（其他忽略）
   - 按 mtime 倒序取最多 3 个
   - 每个 plan 提取前 50 行或 2000 字符（取短者）
   - 整体注入内容 token 预算上限 **2000 tokens**（用字符数 × 0.25 作近似上限），超出则截断并附 `[... N plans truncated]` 提示
   - 输出到 stdout，格式与现有 hook 兼容（以 `=== Forge Context ===` 头部开头）
3. THE `scripts/inject-plan-context.mjs` SHALL 为 Node.js 脚本（不引入新依赖，仅使用 `node:fs` / `node:path`）
4. THE 新增 `test/inject-plan-context.test.ts` 单元测试：
   - 给定 N 个 plan（其中 M 个 active），注入结果仅包含 active
   - 注入总长度 ≤ 2000 字符
   - 空 `.tinkerman/plans/` 输出空内容，不报错
   - 格式正确（含 `=== Forge Context ===` 头）
5. THE `hooks.json` 中原 bash 命令 SHALL 被完全替换（不保留作为 fallback），降低维护面
6. THE `scripts/inject-plan-context.mjs` SHALL 在文件头的注释中说明用途与集成位置
7. THE 改动 SHALL 关闭 `.tinkerman/findings/dogfooding-observations.md` 中发现 6「Context Window 压力」的 plan 注入部分

---

## 验收门禁（整体）

- `npm run check` 全绿（含 typecheck、lint、coverage@90、shellcheck、skill refs strict、README metrics、skill description、skill length、evolution-marker、public-api）
- `npm run test:e2e` 独立全绿，墙钟 ≤ 5 分钟
- `forge-v2.3-technical-review.md` §8 风险清单中 R1 / R3 / R4 / R5 / R6 被在后续评审或变更记录中标记为"已缓解"
- 公共 API 文档（`docs/api/`）重建后体积减小 ≥ 40%
- `src/` 下 `console.*`、`execSync` 均无未豁免的使用

## 风险与权衡

| 风险 | 影响 | 缓解 |
|------|------|------|
| 需求 1/3 涉及启动路径与 API 面 breaking | 中 | 先发 v2.3.1 warning 过渡版（新行为为 opt-in），v2.4.0 再切默认；CHANGELOG 显式 `[BREAKING]` 条目 |
| 需求 2 E2E 测试可能 flaky | 中 | 使用 mock SDK + 临时 git 仓库；每条测试独立 cwd；失败时保留临时目录 + 上传 artifact |
| 需求 4 覆盖率门禁上调可能阻断历史 PR | 低 | 先在 main 验证通过再启用；提供一次性宽限窗口 |
| 需求 6 Biome noConsole 可能误伤 CLI 入口 | 低 | CLI 用户输出走 `ConsoleSink`；必要处 biome-ignore 一次性声明 |
| 需求 8 hook 脚本依赖 Node 可用 | 低 | Node 在 `forge-loop` 用户场景中是硬依赖（已隐含）；失败时回退到"不注入"而非报错 |

## 参考

- `forge-v2.3-technical-review.md` §7.1, §8, §9（主要来源）
- `forge-v2.3-executive-audit.md`（交叉验证）
- `.tinkerman/findings/skill-function-audit.md`（需求 5）
- `.tinkerman/findings/dogfooding-observations.md` 发现 6（需求 8）
- `ROADMAP.md` v2.2.1 H-1 `validateHooksPresence` 的基础（需求 1 在其上继续强化）
- `.tinkerman/decisions/ADR-TEMPLATE.md`（每条需求实施时需补 ADR）
