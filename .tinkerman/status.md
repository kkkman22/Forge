---
current_task: "zcode-p1-base-integration"
tier: "light"
work_nature: "feature"
task_type: "infra"
project_phase: "ship"
phase: "review_passed"
spec: ".tinkerman/specs/zcode-p1-base-integration/"
updated: "2026-07-09"
current_task_index: "none (review passed)"
completed_tasks: "spec-locked, T1-T11, review (3-layer pass), review-fixes F1-F5"
review_result: "pass (3-layer: spec pass-with-findings→fixed, quality pass, security pass; 0 P0/P1)"
next_phase: "ship"
committed_at: "ab0f5e4b"
branch: "forge/zcode-p1-base-integration"
hints: "dual-platform-transparent,fail-safe-claude,zcode-schema-whitelist,no-revive-v2-voided"
execution_strategy: "light (build→review); T4→T5→T6 (R2 chain) + T1→T2→T3 (R1 chain) parallel; T7/T8/T9 verify; T10 evidence; T11 aggregate gate"
---

# 项目状态

## 当前任务：zcode-p1-base-integration

Forge→ZCode 适配 P1 基础接入。依据《Forge×ZCode 结合方案》v2 §8 P1。spec 已锁定（6 Requirement / 32 AC / 11 Task）。

### P1 范围

1. R1 工作区配置生成（`/forge init --platform zcode` 生成 `.zcode/config.json` + Stop hook）
2. R2 hook stdout JSON 平台裁剪（ZCode 下仅白名单 key，Claude 侧不变）
3. R3 evolved-rules SessionStart 注入验证（回归脚本 + 证据）
4. R4 `${CLAUDE_*}` 模板变量展开验证（回归脚本 + 证据）
5. R5 agent 加载验证（24 角色，回归脚本 + 证据）
6. R6 双平台透明聚合回归（byte-equal + 快照双守）

### 硬约束

- 双平台共享源码，改动对 Claude Code 透明
- 不撤销 v2 结论（不改 bash / 不建 shim / 不复活 12 失败诊断）
- node 可用，mjs 零改动，`${CLAUDE_PLUGIN_ROOT}` 原生展开

### 下一动作

T4 平台探测共享判定（R2 基础，T5/T6 依赖它）。
