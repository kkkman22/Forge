# Spec Document Format

## 3. Spec Document Format

### YAML Frontmatter

```yaml
---
feature: "<功能名>"        # kebab-case
status: "draft" | "locked"
date: "YYYY-MM-DD"
import_source: "<path>"    # 可选，仅导入模式
---
```

### Body Structure

```markdown
## 目的 — <解决问题，为谁>
## 需求 — ### 需求 N：<标题> + 行为描述 + **场景**：当...则...
## 场景汇总 — | ID | Scenario | Requirement |
## Current State — **必填**，AI 必须先读代码。Related Modules 表 + Structure Overview
## Proposed Change — **必填**。To Change + Explicitly Unchanged
## 不做什么 — 划清边界
## Reversibility — **必填**。Rollback Checklist + Mount Points
## 反漂移声明 — 主目标 + 非目标代理信号 + 验证材料角色
## Delta — 仅棕地开发：New / Modified / Unchanged
```
