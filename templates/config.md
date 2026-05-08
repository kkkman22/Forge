---
project: "<项目名称>"
stack: ["TypeScript", "React", "Node.js"]
security_level: 1  # 1=标准, 2=高, 3=最高
knowledge_limit: 20
restatement_interval: 3  # Range: 2–10, default: 3. Triggers Restatement Checkpoint every N tasks
verify_commands:            # Ralph Loop: Build 完成后自动运行的验证命令列表
  - "npm run lint"
  - "npm run typecheck"
  - "npm test -- --run"
verify_timeout: 120         # 每条验证命令的超时时间（秒），默认 120
verify_max_attempts: 3      # 验证失败后最大重试次数，默认 3，超过则触发 soft_failure + rollback
ci_check_command: ""        # 项目的完整 CI 检查命令（如 "npm run check"），build 全量测试、test 验证清单和 ship Test 门禁必须使用此命令
# cmux 可选集成（全部 optional，不影响 Forge 核心行为）
# cmux_integration: auto    # auto | on | off; auto=检测到 cmux 则启用，默认 auto
# cmux_notification_budget: 5  # 每个会话的桌面通知上限，正整数或 0，默认 5
# cmux_review_notify: on    # on | off; 是否发送评审聚合通知，默认 on
# cmux_session_idle_minutes: 15  # 会话空闲超时（分钟），正整数，默认 15
# cmux_respawn_budget: 3    # Mirror_Daemon 崩溃后自动重启上限，正整数或 0，默认 3
---

## CI 检查命令

### 优先级规则

| 场景 | ci_check_command 非空 | ci_check_command 空/缺失 |
|------|----------------------|------------------------|
| build Final Validation | 执行 ci_check_command | 按 verify_commands 逐条执行；若也为空，AI 自动检测 |
| test Layer 3 清单项 1-4 | 执行 ci_check_command，从输出提取各项状态 | 为每项分别运行对应命令 |
| ship Test 门禁 | 验证 ci_check_command 已执行并通过 | 按 Layer 1 + Layer 3 结果判定 |
| TDD 循环（Forge Loop） | 不受影响，始终使用 verify_commands | 使用 verify_commands |

### 回退链

```
ci_check_command (非空) → 用于全量验证
       ↓ (空/缺失)
verify_commands → 逐条执行
       ↓ (也空/缺失)
AI 自动检测验证命令
```

### 配置示例

```yaml
ci_check_command: "npm run check"    # 完整 CI 检查（build/test/ship 使用）
verify_commands:                      # TDD 循环使用的逐条验证命令
  - "npm run lint"
  - "npm run typecheck"
  - "npm test -- --run"
```

## 状态文件保护分区

`.forge/` 目录下的文件按修改权限分为三个区域：

### 🔒 冻结区（Frozen）— AI 不可修改

以下文件一旦进入锁定/批准状态，AI 在 build 阶段**不得修改**，除非用户明确解锁：

- `.forge/specs/*/spec.md`（status: locked）
- `.forge/plans/*.md`（status: approved）
- `.forge/config.md`

### 🛡️ 受保护区（Guarded）— AI 可追加，不可删除或覆盖

以下文件 AI 可以追加内容，但不得删除已有内容或覆盖文件（维护清理操作除外）：

- `.forge/progress/*.md`（只能标记任务完成，不能删除任务或修改已完成的记录）
- `.forge/reviews/*.md`（只能写入新评审，不能修改已有评审结果）
- `.forge/knowledge/instincts.md`（只能追加或更新置信度，不能删除已有模式，除非 `/forge learn` 维护清理）
- `.forge/knowledge/known-failures.md`（只能追加或更新，不能删除已有失败模式，除非维护清理）
- `.forge/knowledge/solutions/*.md`（只能追加或合并，不能随意删除，除非 `/forge learn` 维护清理）
- `.forge/knowledge/evolved-rules.md`（only updatable by `/forge learn` rule distillation, not deletable outside maintenance）
- `.forge/knowledge/rule-changelog.md`（append-only — only new entries, no deletion of history）

### 🟢 开放区（Open）— AI 可自由修改

以下文件 AI 可以自由创建和修改：

- `.forge/status.md`（状态更新）
- `.forge/decisions/*.md`（决策文档）
- `.forge/findings/*.md`（研究发现）
- `.forge/debug/*.md`（调试记录）
- `.forge/inbox/`（外部规格暂存区 — 开发者放置 PM 交付的 spec 文档，供 `/forge spec <file>` 导入）
- `.forge/knowledge/sessions/*.md`（会话上下文）
- `.forge/knowledge/metrics.md`（指标追踪）
- `.forge/knowledge/tool-health.md`（工具健康度）
- `.forge/knowledge/skill-feedback.md`（SKILL 反馈）
