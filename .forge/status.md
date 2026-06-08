---
current_task: "audit-remediate-0608"
tier: "standard"
phase: "build"
updated: "2026-06-08"
branch: "forge/audit-remediate-0608"
---

# 项目状态

## 当前任务：audit-remediate-0608

修复 2026-06-08 项目审核报告中经源码核实确认的 7 项问题。

### 范围

**P1（必须修复）**：
1. REQ-01: fallback-ladder 测试使用真实 .forge/reviews/，需改为 tmpdir()
2. REQ-02: checkShipGateWithForceSkip 审计不耦合 recordForceSkip
3. REQ-03: stale review 仅 warning 不阻断 ship
4. REQ-04: branch coverage 78.99% < 79% + workflow-naming 测试失败

**P2（应该修复）**：
5. REQ-05: validateTestability() 仅用单一 regex
6. REQ-06: MCP legacy script mode 无 deprecation 警告

- Tier: standard
- Sequence: build → review → test → ship
- Spec: .forge/specs/audit-remediate-0608/requirements.md
- Plan: .forge/specs/audit-remediate-0608/tasks.md (approved)
