---
feature: agent-frontmatter-hardening
layout: tasks
created: 2026-05-30
spec_ref: ".forge/specs/agent-frontmatter-hardening/requirements.md"
---

# Tasks

## Task 1: Review Agent 工具隔离（§1）

- [ ] 1.1 `spec-check.md` 添加 `disallowed-tools: [Bash, Write, Edit, Agent]`
- [ ] 1.2 `quality-check.md` 添加同样字段
- [ ] 1.3 `security-check.md` 添加同样字段

**Verify-By**: bash — `grep -l 'disallowed-tools' .claude/agents/spec-check.md .claude/agents/quality-check.md .claude/agents/security-check.md | wc -l` 输出 3
**关联需求**: R1

## Task 2: Agent 持久记忆扩展（§28）

- [ ] 2.1 `forge-build.md` 添加 `memory: project`
- [ ] 2.2 `forge-plan.md` 添加 `memory: project`
- [ ] 2.3 `forge-review.md` 添加 `memory: project`
- [ ] 2.4 `security.md` 添加 `memory: project`

**Verify-By**: bash — `grep -l 'memory: project' .claude/agents/forge-build.md .claude/agents/forge-plan.md .claude/agents/forge-review.md .claude/agents/security.md | wc -l` 输出 4
**关联需求**: R2

## Task 3: Agent 自动启动提示（§29）

- [ ] 3.1 `forge-build.md` 添加 `initialPrompt`（build 阶段 TDD 循环启动）
- [ ] 3.2 `forge-plan.md` 添加 `initialPrompt`（plan 阶段 spec 分析启动）
- [ ] 3.3 `forge-review.md` 添加 `initialPrompt`（review 阶段三层 review 启动）

**Verify-By**: bash — `grep -l 'initialPrompt' .claude/agents/forge-build.md .claude/agents/forge-plan.md .claude/agents/forge-review.md | wc -l` 输出 3
**关联需求**: R3

## Task 4: Decide Agent 高深度思考（§81）

- [ ] 4.1 `forge-decide-lead.md` 添加 `effort: xhigh`
- [ ] 4.2 `forge-decide-arch.md` 添加 `effort: xhigh`
- [ ] 4.3 `forge-decide-product.md` 添加 `effort: xhigh`
- [ ] 4.4 `forge-decide-sec.md` 添加 `effort: xhigh`
- [ ] 4.5 `forge-decide-cost.md` 添加 `effort: high`
- [ ] 4.6 `forge-decide-ops.md` 添加 `effort: high`

**Verify-By**: bash — `grep -c 'effort' .claude/agents/forge-decide-*.md` 输出 6 个匹配
**关联需求**: R4

## Task 5: Subagent 类型限制验证（§30）

- [ ] 5.1 验证 Claude Code 是否支持 frontmatter 级 agent_type 限制
- [ ] 5.2 如支持，在 `forge-review.md` 添加限制
- [ ] 5.3 如不支持，在 review SKILL instructions 中添加 spawn 限制指导

**Verify-By**: manual — 验证限制机制可用性
**关联需求**: R5

## Task 6: 回归验证

- [ ] 6.1 `npm run check` 通过
- [ ] 6.2 `/forge review` → review agent 仍正常完成三层 review
- [ ] 6.3 review agent 尝试 Write → 确认被拒绝（disallowed-tools 生效）

**Verify-By**: bash + manual
**关联需求**: R6
