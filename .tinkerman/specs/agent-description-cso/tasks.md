---
feature: agent-description-cso
layout: tasks
created: 2026-06-04
spec_ref: ".tinkerman/specs/agent-description-cso/requirements.md"
---

# Tasks

## Task 1: 改写核心 Agent Description（decide/review/build 类）

- [ ] 1.1 修改 `.claude/agents/forge-build.md` frontmatter description → `Use when running /forge build or implementing planned tasks`
- [ ] 1.2 修改 `.claude/agents/forge-plan.md` frontmatter description → `Use when running /forge plan or a locked spec needs task breakdown`
- [ ] 1.3 修改 `.claude/agents/forge-review.md` frontmatter description → `Use when running /forge review or code changes need quality gate before ship`
- [ ] 1.4 修改 `.claude/agents/forge-ship.md` frontmatter description → `Use when running /forge ship or completed work needs branch validation and push`
- [ ] 1.5 修改 `.claude/agents/forge-decide-lead.md` frontmatter description → `Use when /forge decide runs in Agent Teams mode`
- [ ] 1.6 修改 `.claude/agents/forge-decide-arch.md` frontmatter description
- [ ] 1.7 修改 `.claude/agents/forge-decide-cost.md` frontmatter description
- [ ] 1.8 修改 `.claude/agents/forge-decide-ops.md` frontmatter description
- [ ] 1.9 修改 `.claude/agents/forge-decide-product.md` frontmatter description
- [ ] 1.10 修改 `.claude/agents/forge-decide-sec.md` frontmatter description

## Task 2: 改写视角 Agent Description（architect/product/security 等）

- [ ] 2.1 修改 `.claude/agents/architect.md` frontmatter description
- [ ] 2.2 修改 `.claude/agents/product.md` frontmatter description
- [ ] 2.3 修改 `.claude/agents/security.md` frontmatter description
- [ ] 2.4 修改 `.claude/agents/business-analyst.md` frontmatter description
- [ ] 2.5 修改 `.claude/agents/critic.md` frontmatter description
- [ ] 2.6 修改 `.claude/agents/debugger.md` frontmatter description
- [ ] 2.7 修改 `.claude/agents/designer.md` frontmatter description
- [ ] 2.8 修改 `.claude/agents/explore.md` frontmatter description

## Task 3: 改写 Review Subagent Description

- [ ] 3.1 修改 `.claude/agents/spec-check.md` frontmatter description → `Use in /forge review Layer 1, when verifying implementation matches locked spec`
- [ ] 3.2 修改 `.claude/agents/quality-check.md` frontmatter description → `Use in /forge review Layer 2, when checking code quality of changed files`
- [ ] 3.3 修改 `.claude/agents/security-check.md` frontmatter description → `Use in /forge review Layer 3, when scanning for hardcoded secrets or injection risks`

## Task 4: 改写 Skill Instructions Description

- [ ] 4.1 扫描 `skills/forge/lib/*/instructions.md` 中所有 description 字段
- [ ] 4.2 逐个改写为 "Use when..." 格式（不含流程总结、角色描述）
- [ ] 4.3 验证每个 description ≤ 200 字符

## Task 5: 新增 CSO Description Gate 规则

- [ ] 5.1 创建 `.claude/rules/cso-description-gate.md`
- [ ] 5.2 写入 CSO 规则说明（"Use when" 开头 + 禁止角色/流程/能力描述）

## Task 6: 验证

- [ ] 6.1 运行 `grep -rn '^description:' .claude/agents/` 确认全部以 "Use" 或 "Use when" 开头
- [ ] 6.2 运行 `grep -rn '^description:' skills/forge/lib/` 确认全部以 "Use" 开头
- [ ] 6.3 人工抽查 5 个 agent 确认 description 不含角色/流程/能力描述
- [ ] 6.4 运行 `npm run check` 确认全量测试通过
