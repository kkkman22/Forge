---
id: "ADR-0008"
title: "Skill disallowed-tools matrix — declarative tool restrictions for forge agents"
status: accepted
date: "2026-05-28"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0007"
---

# ADR-0008: Skill disallowed-tools matrix

## Context

Forge agents operate in subagent contexts where they should only use specific tools. Previously, tool restrictions were enforced only through prompt instructions, which LLMs can ignore. Claude Code 2.1.153+ supports a native `disallowedTools` frontmatter field that the runtime enforces as a hard deny.

The review agent (forge-review) should never write code or mutate git state. Decide agents should be read-only. Plan should not push. Ship should not perform destructive filesystem or git operations. Learn should not push.

## Decision

Add `disallowedTools` to the YAML frontmatter of each forge agent and skill instructions file, per the following matrix:

| Agent/Skill | disallowedTools | Justification |
|---|---|---|
| forge-review | Edit, Write, MultiEdit, NotebookEdit, Bash(git push *), Bash(git commit *), Bash(git reset *) | Review is strictly read-only. Writing code or mutating git state violates the review/build separation principle (CLAUDE.md section 3.1). |
| forge-decide-arch | Edit, Write, MultiEdit, Bash, Agent | Decide agents are analysis-only. They must not modify code or execute arbitrary commands. |
| forge-decide-cost | Edit, Write, MultiEdit, Bash, Agent | Cost analysis is read-only. No code mutation or shell access needed. |
| forge-decide-ops | Edit, Write, MultiEdit, Bash, Agent | Ops analysis is read-only. No code mutation or shell access needed. |
| forge-decide-product | Edit, Write, MultiEdit, Bash, Agent | Product analysis is read-only. No code mutation or shell access needed. |
| forge-decide-sec | Edit, Write, MultiEdit, Bash, Agent | Security analysis is read-only. No code mutation or shell access needed. |
| forge-plan | Edit, Write, MultiEdit, Bash(git push *) | Plan produces task lists but must not push code. Write/Edit are restricted because plan output goes through the plan file system, not direct tool use. |
| forge-ship | Bash(rm -rf *), Bash(git reset --hard *) | Ship needs write access for commits and pushes, but must never perform destructive filesystem operations or hard resets that discard work. |
| forge-learn | Bash(git push *) | Learn writes knowledge files but must never push to remote. Knowledge stays local. |

### Field Format

The `disallowedTools` field uses the Claude Code native YAML frontmatter format:

```yaml
disallowedTools: [Edit, Write, MultiEdit, "Bash(git push *)", "Bash(git commit *)"]
```

Bash tool restrictions use the pattern `Bash(<command pattern>)` where the pattern matches the command string.

### Relationship to Existing `tools` Field

Some agents already have a `tools` field (allowlist). The `disallowedTools` field acts as a denylist that overrides the allowlist. Both can coexist: `tools` defines what the agent may use, `disallowedTools` defines what the runtime blocks even if listed in `tools`.

For agents that already had `disallowedTools` (forge-decide-*), no changes were needed beyond verifying the matrix alignment.

## Consequences

### Positive

- Runtime-enforced tool restrictions prevent accidental code mutation by review/decide agents
- Matrix is auditable via contract tests (test/contract/skill-disallowed-tools.test.ts)
- ADR serves as the single source of truth for tool restriction rationale
- Defense-in-depth: even if prompt instructions are ignored, the runtime blocks restricted tools

### Negative

- If an agent legitimately needs a new tool, both `tools` and `disallowedTools` must be updated
- Bash pattern matching is string-prefix based, not regex; complex patterns may need refinement
