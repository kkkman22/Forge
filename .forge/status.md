---
current_task: "partial-spec-backlog-remediation"
tier: "standard"
phase: "ship"
updated: "2026-06-07"
branch: "forge/partial-spec-backlog-remediation"
spec: ".forge/specs/partial-spec-backlog-remediation/requirements.md"
plan: ".forge/specs/partial-spec-backlog-remediation/tasks.md"
---

# 项目状态

## 当前任务：partial-spec-backlog-remediation

修复 `.forge/docs/partial-spec-satisfaction.md` 复核后仍值得做的确定性缺口：补齐当前 hook manifest 注册、给 cleanup git 操作增加超时、补 resume 阶段回归测试，并把已被当前架构替代的旧 spec 状态文档化。

### 范围

- REQ-01: 注册 ConfigChange hook
- REQ-02: 补齐缺失生命周期 hook 注册
- REQ-03: 降低 hook command 字符串漂移风险
- REQ-04: cleanup-chain git worktree remove 超时
- REQ-05: resume phase coverage 回归测试
- REQ-06: Superseded specs 文档化

- Tier: standard
- Sequence: plan → build → review → test → ship
