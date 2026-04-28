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
---

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
