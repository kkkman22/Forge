# Diff Context Preparation

> 由 forge-review SKILL.md §2.0 引用。在启动任何 Subagent 之前，编排层必须执行以下步骤准备 diff 上下文，写入 `.forge/reviews/.diff-context.md` 作为 Subagent prompt 的一部分。

## Step 1：确定 diff 基准

```bash
BASE_BRANCH=$(git merge-base main HEAD 2>/dev/null || echo "HEAD~1")
```

## Step 2：获取 diff stat

```bash
git diff --stat ${BASE_BRANCH}...HEAD
```

## Step 3：获取 diff 内容（带智能截断）

### 优先路径（forge-context MCP 可用时）

调用 `forge_git(subcommand="diff-content", args="${BASE_BRANCH}...HEAD")`。

该工具自动执行：

- 按文件优先级排序（源码 > 配置 > 测试 > 生成文件 > lock 文件）
- 单文件上限 200 行，总量上限 3000 行
- 截断后附注省略文件列表

### 降级路径（forge-context MCP 不可用时）

```bash
DIFF_CONTENT=$(git diff ${BASE_BRANCH}...HEAD -- \
  ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)dist/*' ':(exclude)*.d.ts' \
  | head -3000)
```

降级路径的局限：无文件优先级排序，大文件可能占满预算。

**检测方法**：尝试调用 `forge_git`，如果工具不存在或返回错误，自动切换到降级路径。不报警告，不阻断流程。

## Step 4：写入 diff context 文件

将 diff 内容写入 `.forge/reviews/.diff-context.md`，格式：

```markdown
---
base: <BASE_BRANCH commit hash>
head: <HEAD commit hash>
file_count: <N>
total_added: <N>
total_removed: <N>
truncated: <true|false>
source: <"forge_git" | "shell_fallback">
---

## Diff Stat
<git diff --stat output>

## Diff Content
<truncated patch content>
```

## 截断策略

- diff ≤3000 行：完整注入
- diff >3000 行：按文件优先级截断（优先路径）或暴力截断（降级路径）
- 截断后附注省略文件列表，agent 可对存疑项用 Read 深入验证（最多 3-5 次）

## 推荐配置

安装 forge-context MCP 可显著提升大变更集（≥15 文件）的评审质量。`scripts/init.sh` 会自动配置。
