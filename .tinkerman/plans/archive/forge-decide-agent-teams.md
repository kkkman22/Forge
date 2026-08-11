---
topic: "forge-decide-agent-teams"
status: "superseded"
superseded_by: ".tinkerman/archive/2026-05-24-agent-teams-poc-plan/README.md"
superseded_reason: "PoC infrastructure shipped but live comparison runs never executed; superseded by Tier 1 governance in ROADMAP.md and ADR-0007"
superseded_date: "2026-05-24"
date: "2026-05-12"
spec_ref: ".kiro/specs/forge-decide-agent-teams"
format: "lightweight"
---

## Objective

为 `/forge decide` 新增 Agent Teams 模式的 PoC 实现，使用 Claude Code 原生 Agent Teams（tmux 面板并行）替代现有 DAG subagent 模式，收集对比数据（延迟、token、失败恢复）形成 adopt/keep/hybrid 决策依据。完全 opt-in，不改动现有实现。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#components-and-interfaces` | 5 个组件定义：SKILL、Team Lead、5 个 Viewpoint Agents、对比脚本、PoC 报告 |
| `design.md#architecture` | Teams 模式运行拓扑：skill → lead → 5 teammates 并行 → ADR 合成 |
| `design.md#error-handling` | env var 缺失、tmux 不可用、版本不足、超时、teammate 失败的错误处理策略 |
| `design.md#testing-strategy` | Contract test + 脚本测试 + 12 次 PoC 运行（3 topic × 2 mode × 2 iter） |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `.kiro/specs/forge-decide-agent-teams/poc-topics.md` | CREATE | 3 个固定 PoC topic（simple/medium/complex） |
| `.claude/agents/forge-decide-arch.md` | CREATE | 架构视角 teammate agent |
| `.claude/agents/forge-decide-sec.md` | CREATE | 安全视角 teammate agent |
| `.claude/agents/forge-decide-cost.md` | CREATE | 成本视角 teammate agent |
| `.claude/agents/forge-decide-ops.md` | CREATE | 运维视角 teammate agent |
| `.claude/agents/forge-decide-product.md` | CREATE | 产品视角 teammate agent |
| `.claude/agents/forge-decide-lead.md` | CREATE | Team lead 协调 agent |
| `skills/forge-decide-teams/SKILL.md` | CREATE | Agent Teams 模式的 decide skill |
| `scripts/run-decide-poc.sh` | CREATE | DAG vs Teams 对比运行脚本 |
| `scripts/parse-decide-poc-metrics.mjs` | CREATE | JSONL → metrics Markdown 解析器 |
| `test/forge-decide-teams.contract.test.ts` | CREATE | Agent 定义 + SKILL 结构契约测试 |
| `test/run-decide-poc.test.sh` | CREATE | 对比脚本 mock 测试 |
| `skills/forge-decide/SKILL.md` | MODIFY | 加一行 PoC 指向说明 |

## Task Breakdown

### Task 1: PoC Topics 定义
- **Goal**: 创建 3 个固定 PoC topic 覆盖 simple/medium/complex
- **File**: `.kiro/specs/forge-decide-agent-teams/poc-topics.md`
- **Design Reference**: `design.md#data-models` — PoC Topic 格式定义 3 个 topic（CLI flag / config 拆分 / plugin 系统）
- **Depends On**: (none)
- **Verify**: `test -f .kiro/specs/forge-decide-agent-teams/poc-topics.md && grep -c "## " .kiro/specs/forge-decide-agent-teams/poc-topics.md`
- **Commit**: `feat(decide-poc): add 3 fixed PoC topics for DAG vs Teams comparison`

### Task 2: 架构视角 Agent
- **Goal**: 创建架构视角 teammate agent，限定只读工具和 15 turn 上限
- **File**: `.claude/agents/forge-decide-arch.md`
- **Design Reference**: `design.md#component-3-viewpoint-agents` — Viewpoint agent frontmatter 模板和 arch 视角职责（架构一致性、技术债、可扩展性）
- **Depends On**: (none)
- **Verify**: `test -f .claude/agents/forge-decide-arch.md && head -20 .claude/agents/forge-decide-arch.md | grep -q "name: forge-decide-arch"`
- **Commit**: `feat(decide-poc): add architecture viewpoint agent`

### Task 3: 安全视角 Agent
- **Goal**: 创建安全视角 teammate agent
- **File**: `.claude/agents/forge-decide-sec.md`
- **Design Reference**: `design.md#component-3-viewpoint-agents` — sec 视角职责（威胁模型、权限模型、数据流保密性）
- **Depends On**: (none)
- **Verify**: `test -f .claude/agents/forge-decide-sec.md && head -20 .claude/agents/forge-decide-sec.md | grep -q "name: forge-decide-sec"`
- **Commit**: `feat(decide-poc): add security viewpoint agent`

### Task 4: 成本视角 Agent
- **Goal**: 创建成本视角 teammate agent
- **File**: `.claude/agents/forge-decide-cost.md`
- **Design Reference**: `design.md#component-3-viewpoint-agents` — cost 视角职责（一次性成本、维护成本、机会成本）
- **Depends On**: (none)
- **Verify**: `test -f .claude/agents/forge-decide-cost.md && head -20 .claude/agents/forge-decide-cost.md | grep -q "name: forge-decide-cost"`
- **Commit**: `feat(decide-poc): add cost viewpoint agent`

### Task 5: 运维视角 Agent
- **Goal**: 创建运维视角 teammate agent
- **File**: `.claude/agents/forge-decide-ops.md`
- **Design Reference**: `design.md#component-3-viewpoint-agents` — ops 视角职责（可观测性、故障恢复、部署复杂度）
- **Depends On**: (none)
- **Verify**: `test -f .claude/agents/forge-decide-ops.md && head -20 .claude/agents/forge-decide-ops.md | grep -q "name: forge-decide-ops"`
- **Commit**: `feat(decide-poc): add ops viewpoint agent`

### Task 6: 产品视角 Agent
- **Goal**: 创建产品视角 teammate agent
- **File**: `.claude/agents/forge-decide-product.md`
- **Design Reference**: `design.md#component-3-viewpoint-agents` — product 视角职责（用户价值、DX、竞品对比）
- **Depends On**: (none)
- **Verify**: `test -f .claude/agents/forge-decide-product.md && head -20 .claude/agents/forge-decide-product.md | grep -q "name: forge-decide-product"`
- **Commit**: `feat(decide-poc): add product viewpoint agent`

### Task 7: Team Lead Agent
- **Goal**: 创建 team lead 协调 agent，含 restrictedSubagents、ADR 合成工作流、超时提示
- **File**: `.claude/agents/forge-decide-lead.md`
- **Design Reference**: `design.md#component-2-team_lead_agent-definition` — lead frontmatter（restrictedSubagents 5 个 viewpoint + initialPrompt）和工作流（并行派发、等待、合成 ADR）
- **Depends On**: Task 2, 3, 4, 5, 6
- **Verify**: `test -f .claude/agents/forge-decide-lead.md && grep -q "restrictedSubagents" .claude/agents/forge-decide-lead.md`
- **Commit**: `feat(decide-poc): add team lead agent with 5 viewpoint dispatch`

### Task 8: forge-decide-teams SKILL
- **Goal**: 创建 Agent Teams 版 decide skill，含 env var 检查、tmux 检查、lead 调度
- **File**: `skills/forge-decide-teams/SKILL.md`
- **Design Reference**: `design.md#component-1-forge-decide-teams-skill` — Execution Contract（env var、tmux、CC 版本检查）、Workflow（Agent(subagent_type="forge-decide-lead")调用）、.tinkerman/runs 写入
- **Depends On**: Task 7
- **Verify**: `test -f skills/forge-decide-teams/SKILL.md && grep -q "forge-decide-lead" skills/forge-decide-teams/SKILL.md`
- **Commit**: `feat(decide-poc): add forge-decide-teams skill with env checks`

### Task 9: 现有 SKILL 微调
- **Goal**: 在现有 forge-decide SKILL.md 加一行 PoC 指向说明
- **File**: `skills/forge-decide/SKILL.md`
- **Design Reference**: `design.md#component-1-forge-decide-teams-skill` — 不修改现有行为，仅加 "Alternative: Agent Teams mode (PoC)" 说明
- **Depends On**: Task 8
- **Verify**: `grep -q "Agent Teams" skills/forge-decide/SKILL.md`
- **Commit**: `docs(decide): add Agent Teams PoC note to existing skill`

### Task 10: 对比脚本
- **Goal**: 创建 DAG vs Teams 对比运行脚本和 metrics 解析器
- **File**: `scripts/run-decide-poc.sh`, `scripts/parse-decide-poc-metrics.mjs`
- **Design Reference**: `design.md#component-4-对比脚本` — run-decide-poc.sh 支持 --topic-id，调用 claude -p --output-format stream-json 两次；parse-decide-poc-metrics.mjs 从 JSONL 提取 token/duration/failure
- **Depends On**: Task 8
- **Verify**: `bash -n scripts/run-decide-poc.sh && node -c scripts/parse-decide-poc-metrics.mjs`
- **Commit**: `feat(decide-poc): add comparison runner script and metrics parser`

### Task 11: 契约测试
- **Goal**: 创建 agent 定义结构测试和脚本测试，验证 frontmatter 完整性和工具约束
- **File**: `test/forge-decide-teams.contract.test.ts`, `test/run-decide-poc.test.sh`
- **Design Reference**: `design.md#testing-strategy` — Contract test 断言 5 个 agent 存在、disallowedTools 含 Write/Edit/Bash、lead 的 restrictedSubagents 恰为 5 个 viewpoint、SKILL 含必需章节；脚本测试用 mock claude 验证不崩溃
- **Depends On**: Task 2, 3, 4, 5, 6, 7, 8, 10
- **Verify**: `npx vitest run test/forge-decide-teams.contract.test.ts && bash test/run-decide-poc.test.sh`
- **Commit**: `test(decide-poc): add contract tests for agent definitions and PoC scripts`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1: Agent Teams 版 `/forge decide` 实现 | Task 1, 2, 3, 4, 5, 6, 7, 8 |
| R2: Teammate_Agent frontmatter 规范 | Task 2, 3, 4, 5, 6, 11 |
| R3: 团队间通信与结果汇总 | Task 7, 8 |
| R4: 失败恢复与可观测性 | Task 7, 8 |
| R5: PoC 对比评估报告 | Task 1, 10, 11 |
| R6: 文档与 opt-out | Task 9 |
