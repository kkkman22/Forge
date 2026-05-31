---
name: token-layered-defense
status: draft
created: "2026-05-31"
updated: "2026-05-31"
tier: standard
---

# Tasks: Token 分层防御体系

## Wave 1: 零成本配置（不改 Forge 代码）

### Task 1: 全局压缩阈值配置

- [ ] 1.1 在 `hooks/hooks.json` 的 env 字段新增 `"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"`
- [ ] 1.2 验证 `forge_compact_restate_reminder` 在 compact 后正常重注入关键上下文
- [ ] 1.3 在 `scripts/track-read-budget.mjs` 文件头部注释 `@deprecated` 标记，说明被 AUTOCOMPACT 替代

**RED**: 开启 Forge 会话，触发多次 plan/build 操作，观察上下文占用超过 60% 时是否自动 compact
**GREEN**: 确认 compact 后 `forge_compact_restate_reminder` hook 重新注入了 plan 上下文
**REFACTOR**: 清理 `track-read-budget.mjs` 相关的 SessionStart hook（清理预算文件）中的过时注释

**Verify-By**: bash — `grep 'AUTOCOMPACT' hooks/hooks.json` 且 grep `@deprecated` in track-read-budget.mjs
**关联需求**: R1

### Task 2: bash-ban-raw.mjs 拦截脚本

- [ ] 2.1 创建 `scripts/bash-ban-raw.mjs`，实现智能过滤逻辑：
  - 拦截：`cat file`、`head file`、`tail file`、`grep pattern file`（非管道）
  - 放行：所有管道组合（`find ... | grep`）、`npm`/`git`/`node` 等非文件读取命令
  - 逃生门：检测 `/tmp/bash-raw-unlock-$PPID`（10 分钟过期）
- [ ] 2.2 在 `hooks/hooks.json` 的 hooks.PreToolUse 中注册（matcher: Bash, timeout: 2）
- [ ] 2.3 编写单元测试 `scripts/__tests__/bash-ban-raw.test.mjs`，覆盖：
  - 拦截 `cat file.py` → exit 2
  - 拦截 `grep pattern file.py` → exit 2
  - 放行 `find . -name '*.ts' | grep export` → exit 0
  - 放行 `npm test` → exit 0
  - 放行 `git status` → exit 0
  - 逃生门生效 → exit 0

**RED**: 测试用例先写，验证拦截/放行逻辑正确
**GREEN**: 实现 `bash-ban-raw.mjs`，通过所有测试
**REFACTOR**: 提取命令解析逻辑为独立函数，便于维护

**Verify-By**: bash — `node --test scripts/__tests__/bash-ban-raw.test.mjs` && `grep bash-ban-raw hooks/hooks.json`
**关联需求**: R2

### Task 2.5: RTK 集成到 forge_exec（默认压缩引擎）

- [ ] 2.5.1 在 `src/mcp/tools/forge-exec.ts` 中新增 RTK 检测和调用逻辑：
  - 检测 `rtk` 二进制是否在 PATH 中（`which rtk`，<5ms）
  - 成功输出（exit = 0）→ 通过 RTK 管道压缩（`echo "$stdout" | rtk compress`）
  - 失败输出（exit ≠ 0）→ 完整返回，绕过 RTK（Iron Law）
  - RTK 不可用 → 回退到 `trimCommandOutput()`
- [ ] 2.5.2 更新 `src/mcp/trimmers/output.ts`：
  - 导出 `trimWithFallback(stdout, stderr, exitCode, rtkAvailable)` 函数
  - 标记 `trimCommandOutput` 为 fallback（RTK 不可用时使用）
- [ ] 2.5.3 编写测试 `src/mcp/tools/__tests__/forge-exec-rtk.test.ts`，覆盖：
  - RTK 可用 + 成功输出 → RTK 压缩
  - RTK 可用 + 失败输出 → 完整输出（Iron Law）
  - RTK 不可用 + 成功输出 → `trimCommandOutput` fallback
  - RTK 执行超时（>5s）→ fallback 到 `trimCommandOutput`
  - RTK 进程崩溃 → fallback 到 `trimCommandOutput`

**RED**: 测试用例先写，验证 RTK/fallback/iron-law 三条路径
**GREEN**: 实现 RTK 集成，通过所有测试
**REFACTOR**: 抽象压缩引擎接口（`CompressionEngine`），便于未来替换为其他压缩器

**Verify-By**: bash — `npx vitest run src/mcp/tools/__tests__/forge-exec-rtk.test.ts`
**关联需求**: R4

### Task 3: Wave 1 回归验证

- [ ] 3.1 `npm run check` 通过
- [ ] 3.2 手动验证：Forge 会话中执行 `cat package.json` 被拦截，提示使用 Read 工具
- [ ] 3.3 手动验证：Explorer agent 的批量分析脚本正常运行（不被误拦截）
- [ ] 3.4 手动验证：上下文超过 60% 时自动 compact，compact 后 plan 上下文重注入
- [ ] 3.5 手动验证：`forge_exec` 成功输出经过 RTK 压缩（安装 RTK 时）或 fallback 到 trimmer（未安装时）
- [ ] 3.6 手动验证：`forge_exec` 失败输出完整返回（Iron Law 不受 RTK 影响）

**Verify-By**: bash + manual
**关联需求**: R1, R2, R4

---

## Wave 2: CRG 集成（轻量安装）

### Task 4: companion 检测脚本

- [ ] 4.1 创建 `scripts/check-companions.mjs`，检测 CRG 是否已安装：
  - 尝试调用 `code-review-graph status`（exit 0 = 已安装）
  - 输出检测结果到 stdout（供 SessionStart hook 注入）
- [ ] 4.2 在 SessionStart hook 中注册，检测 CRG 可用性并注入规则提示

**RED**: 未安装 CRG 时脚本输出 "CRG: not available"
**GREEN**: 安装 CRG 后脚本输出 "CRG: available"，且注入使用规则
**REFACTOR**: 抽象检测逻辑为通用 companion 框架（未来可检测 context-mode、Headroom）

**Verify-By**: bash — `node scripts/check-companions.mjs`
**关联需求**: R3

### Task 5: Explore agent Fallback Ladder

- [ ] 5.1 更新 `.claude/agents/explore.md`，新增 CRG Fallback Ladder：
  ```
  ## 代码探索策略（Fallback Ladder）
  L0: code-review-graph 可用 → query_graph_tool（~100 tokens）
  L1: 无 CRG → Think in Code batch scripts（~3K tokens）
  ```
- [ ] 5.2 新增 CRG 工具使用指南：
  - 查定义 → `query_graph_tool`
  - 查调用链 → `traverse_graph_tool`
  - 查影响范围 → `get_impact_radius_tool`
  - 获取最小上下文 → `get_minimal_context_tool`（~100 tokens）
- [ ] 5.3 保留现有 "Think in Code" 脚本作为 L1 fallback，不删除

**RED**: CRG 不可用时 Explore agent 正常使用 batch 脚本
**GREEN**: CRG 可用时 Explore agent 优先使用 graph 查询
**REFACTOR**: 统一 Explore agent 的输出格式，使 CRG 和 batch 脚本结果格式一致

**Verify-By**: manual — 分别在有无 CRG 的环境下运行 Explore agent，验证输出
**关联需求**: R3

### Task 6: `forge_read_cached` 退役标记

- [ ] 6.1 在 `src/mcp/tools/forge-read-cached.ts` 文件头部注释 `@deprecated — superseded by CRG code graph`
- [ ] 6.2 在 `src/mcp/server.ts` 中保留注册（不删除，向后兼容）
- [ ] 6.3 在 `src/mcp/read-cache.ts` 和 `src/mcp/read-cache-hash.ts` 文件头部标记 deprecated

**Verify-By**: bash — `grep '@deprecated' src/mcp/tools/forge-read-cached.ts`
**关联需求**: R3

### Task 7: Wave 2 回归验证

- [ ] 7.1 `npm run check` 通过
- [ ] 7.2 CRG 未安装时：完整 `/forge plan` 流程正常（回退到 batch 脚本）
- [ ] 7.3 CRG 已安装时：`/forge plan` 使用 CRG 查询，token 消耗显著降低
- [ ] 7.4 CRG MCP server 崩溃时：自动回退到 batch 脚本，不阻断工作流

**Verify-By**: bash + manual
**关联需求**: R3

---

## Wave 3: 默认工具集成（forge init 自动安装）

### Task 8: 扩展 forge init Step 7 为 companion 工具批量安装

- [ ] 8.1 更新 `scripts/init.sh` Step 7，从只安装 CRG 扩展为按顺序安装 4 个工具（每个失败不阻断后续）：
  - a. CRG（`pip install code-review-graph && code-review-graph install --platform claude-code && code-review-graph build`）
  - b. Headroom + RTK（`pip install headroom-ai[all]`）
  - c. context-mode（`claude plugin marketplace add mksglu/context-mode && npm install -g context-mode`）
  - d. Caveman（`claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman`）
- [ ] 8.2 每个工具安装前检测前置条件（pip/npm/claude plugin 命令是否可用）
- [ ] 8.3 每个工具安装后输出结果（成功 ✅ / 失败 ⚠️ + 手动安装命令）
- [ ] 8.4 更新 `forge init` 完成输出，新增「Token 优化工具」状态表格（已安装/未安装/fallback）
- [ ] 8.5 更新 `forge init` 完成输出，新增 Headroom wrapper 使用说明

**RED**: 在无 pip 的环境运行 `forge init`，验证所有工具跳过且不阻断
**GREEN**: 在有 pip + npm 的环境运行 `forge init`，验证 4 个工具全部安装成功
**REFACTOR**: 提取工具安装逻辑为 `scripts/install-companions.sh`，init.sh 调用它

**Verify-By**: bash — `grep 'install-companions\|headroom-ai\|context-mode\|caveman' scripts/init.sh`
**关联需求**: R9

### Task 9: Prompt 缓存 A/B 验证

- [ ] 9.1 选择典型 `/forge build` 任务（中等复杂度）
- [ ] 9.2 记录 baseline：`ENABLE_PROMPT_CACHING_1H=false` 时的总 token 消耗
- [ ] 9.3 开启 `ENABLE_PROMPT_CACHING_1H=1`，重复相同任务，记录总 token 消耗
- [ ] 9.4 对比结果，决定是否永久启用
- [ ] 9.5 记录决策到 ADR：`.forge/decisions/2026-05-31-prompt-caching-decision.md`

**Verify-By**: manual — ADR 文档存在且包含数据支撑的结论
**关联需求**: R5

### Task 10: context-mode 集成验证

- [ ] 10.1 验证 context-mode 与 `forge_exec` + RTK 不冲突（不同层处理不同大小的输出）
- [ ] 10.2 验证 context-mode 的 BM25 索引在会话间持久化
- [ ] 10.3 验证 context-mode 不可用时自动回退（`forge_exec` + RTK 处理所有输出）

**Verify-By**: manual — 分别在有/无 context-mode 的环境下运行大输出命令（如完整测试套件）
**关联需求**: R7

### Task 11: Headroom wrapper 集成验证

- [ ] 11.1 验证 `headroom wrap claude` 正常启动 Forge（MCP server、hooks 不受影响）
- [ ] 11.2 验证 `headroom stats` 显示压缩效果
- [ ] 11.3 验证 Headroom 故障时移除 wrapper 后 Forge 正常运行
- [ ] 11.4 验证 `headroom learn` 与 `/forge learn` 互补（不冲突）

**Verify-By**: manual — `headroom wrap claude` + `/forge plan` 流程正常
**关联需求**: R8

### Task 12: Caveman 集成验证

- [ ] 12.1 验证 Caveman 压缩后 Claude 回复不含客套话
- [ ] 12.2 验证 Forge 结构化输出排除列表生效（Spec/ADR/Review/TDD 不被过度压缩）
- [ ] 12.3 验证 Caveman 不可用时 §2.6 Output Conciseness 规则继续生效

**Verify-By**: manual — 对比有/无 Caveman 时的回复长度
**关联需求**: R6

### Task 13: Wave 3 回归验证

- [ ] 13.1 `npm run check` 通过
- [ ] 13.2 完整 `forge init` 在全新项目中运行，验证 4 个 companion 工具全部安装（或优雅跳过）
- [ ] 13.3 所有工具安装/卸载不影响 Forge 核心功能
- [ ] 13.4 完整 `/forge plan → build → review → test → ship` 端到端流程正常（使用 `headroom wrap claude` 启动）

**Verify-By**: bash + manual
**关联需求**: 全部

---

## 依赖关系

```
Task 1 (AUTOCOMPACT) ──┐
Task 2 (bash-ban) ─────┤
Task 2.5 (RTK 集成) ───┼── Task 3 (Wave 1 验证)
                       │
Task 4 (companion 检测) ├── Task 5 (Explore fallback) ├── Task 7 (Wave 2 验证)
Task 6 (read_cached 退役)┘                              │
                                                        │
Task 8 (forge init 扩展) ──┐                            │
Task 9 (prompt 缓存 A/B) ──┼── Task 10 (context-mode)  │
Task 11 (Headroom 验证) ───┤   Task 12 (Caveman)       │
                           └── Task 13 (Wave 3 验证) ←──┘
```

## 预期效果

| 指标 | Wave 1 后 | Wave 2 后 | Wave 3 后（全部默认） |
|------|----------|----------|----------|
| 会话寿命（200K 窗口） | ~50 min（+65%） | ~2h（+300%） | ~3h+（+500%） |
| 代码探索 token | ~35K（batch 脚本） | ~100-3K（CRG） | ~100-3K |
| Shell 输出进入上下文 | 10-40%（RTK 压缩） | 10-40%（RTK） | 5-20%（+context-mode） |
| 回复冗余 | 100%（规则级） | 100% | 25-50%（Caveman） |
| API payload | 100% | 100% | 8-53%（Headroom） |
| 用户安装步骤 | 0（plugin 自动） | 0（CRG 在 forge init） | 0（全部 forge init） |
