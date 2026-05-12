# Tasks

## Task 1: PoC 基础设施准备

- [x] 1.1 新增 `.kiro/specs/forge-decide-agent-teams/poc-topics.md`，定义 3 个固定 topic（simple/medium/complex）
- [x] 1.2 前置检查：确认本地 CC 版本 ≥2.1.32、tmux 可用、订阅级别是否支持 Agent Teams
- [x] 1.3 在 ROADMAP 或 ADR drafts 记录 "PoC 开始日期 + 预期完成时间"

## Task 2: Viewpoint agents 定义

- [x] 2.1 新增 `.claude/agents/forge-decide-arch.md`（架构视角）
- [x] 2.2 新增 `.claude/agents/forge-decide-sec.md`（安全视角）
- [x] 2.3 新增 `.claude/agents/forge-decide-cost.md`（成本视角）
- [x] 2.4 新增 `.claude/agents/forge-decide-ops.md`（运维视角）
- [x] 2.5 新增 `.claude/agents/forge-decide-product.md`（产品视角）
- [x] 2.6 每个 agent 的 frontmatter 包含：name/description/model/maxTurns/allowedTools/disallowedTools/memory/color/initialPrompt
- [x] 2.7 每个 agent 的正文定义视角边界 + 输出格式（4 个小节）
- [x] 2.8 每个 agent 末尾加 `## Learnings` 段落（ccbp-inspired-hardening R7 格式）

## Task 3: Team_Lead_Agent 定义

- [x] 3.1 新增 `.claude/agents/forge-decide-lead.md`
- [x] 3.2 Frontmatter 包含 restrictedSubagents（5 个 viewpoint）+ initialPrompt
- [x] 3.3 Workflow 正文：并行派发、等待 TaskCompleted、合成 ADR
- [x] 3.4 ADR 模板：`.forge/decisions/<date>-<slug>.md`，包含 Viewpoints section
- [x] 3.5 实现超时提示（wall-clock > 20 min 时 prompt）

## Task 4: forge-decide-teams SKILL

- [x] 4.1 新增 `skills/forge-decide-teams/SKILL.md`
- [x] 4.2 Execution Contract：必须检查 env var、tmux、CC 版本
- [x] 4.3 Workflow：`Agent(subagent_type="forge-decide-lead")` 调用
- [x] 4.4 写 `.forge/runs/<ts>-decide-teams-run.md` 的 started_at / finished_at
- [x] 4.5 SessionStart / SessionEnd hook 挂接
- [x] 4.6 SKILL ≤150 行，超行内容移到 `reference.md`

## Task 5: 对比脚本

- [x] 5.1 新增 `scripts/run-decide-poc.sh`
- [x] 5.2 支持 `--topic-id <A|B|C>`
- [x] 5.3 运行 `claude -p --output-format stream-json` 两次（dag + teams）
- [x] 5.4 新增 `scripts/parse-decide-poc-metrics.mjs` 解析 JSONL 输出 metrics.md
- [x] 5.5 合并 metrics 到 `.forge/runs/decide-poc/<topic-id>-metrics.md`

## Task 6: 现有 skill 微调

- [x] 6.1 修改 `skills/forge-decide/SKILL.md`，增加一行 "Alternative: Agent Teams mode (PoC)"，指向本 spec
- [x] 6.2 不改变 `skills/forge-decide/SKILL.md` 其他行为
- [x] 6.3 contract test 确认现有 skill 的 frontmatter/章节仍完整

## Task 7: 契约测试

- [x] 7.1 新增 `test/forge-decide-teams.contract.test.ts`
- [x] 7.2 断言 5 个 viewpoint agent 文件存在
- [x] 7.3 断言每个 viewpoint agent 的 disallowedTools 含 Write/Edit/Bash
- [x] 7.4 断言 forge-decide-lead 的 restrictedSubagents 恰为 5 个 viewpoint
- [x] 7.5 断言 `skills/forge-decide-teams/SKILL.md` 存在必需章节和 Execution Contract
- [x] 7.6 新增 `test/run-decide-poc.test.sh` mock claude 验证脚本不崩溃
- [x] 7.7 `npm run check` 通过

## Task 8: PoC 运行（非自动化，依赖实际 API 调用）

- [x] 8.1 在干净 session 中设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- [x] 8.2 对 Topic A 运行 dag 模式 2 次，记录 metrics
- [x] 8.3 对 Topic A 运行 teams 模式 2 次，记录 metrics
- [x] 8.4 对 Topic B、C 重复 8.2–8.3
- [x] 8.5 总共 12 次运行的 metrics 汇总到 `.forge/runs/decide-poc/summary-metrics.md`
- [x] 8.6 每次运行后人工 review 输出 ADR 质量，打分（1–5）
- [x] 8.7 记录定性观察（可观测性体验、失败恢复、主观决策质量）

## Task 9: PoC 报告与 ADR

- [x] 9.1 起草 `.forge/decisions/<date>-agent-teams-poc.md`
- [x] 9.2 填入 metrics 表格（12 行）
- [x] 9.3 填入 qualitative observations
- [x] 9.4 给出 recommendation: adopt / keep-dag / hybrid / re-evaluate
- [x] 9.5 列出 follow-up actions
- [x] 9.6 Review 并得到至少 1 人 approve
- [x] 9.7 merge 到 main

## Task 10: 归档或推广

- [x] 10.1 根据 PoC 结论二选一：
  - 若 adopt/hybrid：新 spec `forge-decide-teams-promotion`，计划 stable 化
  - 若 keep-dag：本 spec 归档，`skills/forge-decide-teams/` 删除，5 个 viewpoint agent 删除
- [x] 10.2 更新 CHANGELOG（`[EXPERIMENT]` 条目，注明结论）
- [x] 10.3 在 `.forge/archive/<date>-agent-teams-poc/` 保留 PoC 期间的所有 metrics 原始数据
