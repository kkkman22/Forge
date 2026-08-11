---
feature: session-resume-check
layout: tasks
created: 2026-06-04
spec_ref: ".forge/specs/session-resume-check/requirements.md"
---

# Tasks

## Task 1: 创建 session-start-resume-check.sh

- [ ] 1.1 创建 `hooks/session-start-resume-check.sh`，设为可执行（`chmod +x`）
- [ ] 1.2 实现 4 个检查维度：活跃 phase、未提交变更、P0/P1 review、draft plan
- [ ] 1.3 实现 JSON 输出（`hookSpecificOutput.additionalContext` 格式）
- [ ] 1.4 实现静默模式（无问题输出 `{}`）
- [ ] 1.5 实现 fail-open（任何错误 exit 0）
- [ ] 1.6 添加可扩展注释区域（4 个待追加检查项）

## Task 2: 注册 Hook

- [ ] 2.1 在项目 hook 配置中注册 SessionStart hook（type: command, timeout: 3s）
- [ ] 2.2 确认 hook 配置格式正确（JSON 语法）

## Task 3: 手动验证

- [ ] 3.1 测试场景 A：`.forge/status.md` 含 `phase: build` → 确认提醒出现
- [ ] 3.2 测试场景 B：`.forge/status.md` 含 `phase: idle` → 确认静默
- [ ] 3.3 测试场景 C：feature 分支 + 未提交变更 → 确认提醒出现
- [ ] 3.4 测试 timeout：`time bash hooks/session-start-resume-check.sh` < 1s
- [ ] 3.5 运行 `npm run check` 全量测试通过
