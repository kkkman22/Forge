---
project: "Forge"
stack:
  - "TypeScirpt"
  - "JaveScript"
  - "Shell"
security_level: 1
knowledge_limit: 20
max_parallel_agents: 6    # Range: 1-10, default 6
---

# 项目配置

- **项目名称**：Forge
- **技术栈**：TypeScirpt,JaveScript,Shell
- **安全级别**：标准（Level 1）
- **知识库上限**：20
- **初始化时间**：2026-04-28

## CI 检查命令

build 阶段的全量测试和 test 阶段的验证清单必须使用以下命令，不得自行拼凑：

```bash
npm run check    # = tsc --noEmit && biome check src/ test/ && vitest run && bash scripts/check-readme-metrics.sh
npm run docs     # typedoc 文档生成验证
bash scripts/build-dist.sh  # 分发包同步校验
```

## 状态文件保护分区

`.forge/` 目录下的文件按修改权限分为三个区域：

### 冻结区（Frozen）— AI 不可修改

以下文件一旦进入锁定/批准状态，AI 在 build 阶段**不得修改**，除非用户明确解锁：

- `.forge/specs/*/spec.md`（status: locked）
- `.forge/plans/*.md`（status: approved）
- `.forge/config.md`

### 受保护区（Guarded）— AI 可追加，不可删除或覆盖

以下文件 AI 可以追加内容，但不得删除已有内容或覆盖文件（维护清理操作除外）：

- `.forge/progress/*.md`（只能标记任务完成，不能删除任务或修改已完成的记录）
- `.forge/reviews/*.md`（只能写入新评审，不能修改已有评审结果）
- `.forge/knowledge/instincts.md`（只能追加或更新置信度，不能删除已有模式，除非维护清理）
- `.forge/knowledge/known-failures.md`（只能追加或更新，不能删除已有失败模式，除非维护清理）
- `.forge/knowledge/solutions/*.md`（只能追加或合并，不能随意删除，除非维护清理）

### 开放区（Open）— AI 可自由修改

以下文件 AI 可以自由创建和修改：

- `.forge/status.md`（状态更新）
- `.forge/decisions/*.md`（决策文档）
- `.forge/findings/*.md`（研究发现）
- `.forge/debug/*.md`（调试记录）
- `.forge/knowledge/sessions/*.md`（会话上下文）
- `.forge/knowledge/metrics.md`（指标追踪）
- `.forge/knowledge/tool-health.md`（工具健康度）
- `.forge/knowledge/skill-feedback.md`（SKILL 反馈）
