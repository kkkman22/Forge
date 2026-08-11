---
updated: 2026-08-11
---
# Diff Context Preparation

> 由 forge-review SKILL.md §2.0 引用。在启动任何 Subagent 之前，编排层必须执行 `scripts/prepare-diff-context.mjs` 写入 `.tinkerman/reviews/.diff-context.md` 作为 Subagent prompt 的一部分。

## 单一调用契约

```bash
node scripts/prepare-diff-context.mjs

# 选项：
#   --dry-run   不写文件，只 print 完整内容到 stdout
```

脚本输出 `Wrote .tinkerman/reviews/.diff-context.md` 表示成功；非零退出码表示 git 不可用或写文件失败。

## 脚本内部步骤（封装细节）

下列步骤由脚本自动执行，调用方无需手工拼接：

### Step 1：确定 diff 基准

```
BASE_BRANCH=$(git merge-base main HEAD 2>/dev/null || echo "HEAD~1")
```

### Step 2：获取 diff stat

```
git diff --stat ${BASE_BRANCH}...HEAD
```

### Step 3：获取 diff 内容（带智能截断）

脚本调用 `git diff ${BASE_BRANCH}...HEAD -- ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)dist/*' ':(exclude)*.d.ts'` 取原始 diff，然后调用 `truncateDiffContent` pure function（来自 `dist/src/mcp/tools/forge-git.js`）做按文件优先级截断：

- 按文件优先级排序（源码 > 配置 > 测试 > 生成文件 > lock 文件）
- 单文件上限 200 行，总量上限 1500 行
- 截断后附注省略文件列表

**零 MCP 依赖**：脚本通过 import compiled JS 复用截断逻辑，不调用 forge_git MCP server。这统一了原"forge_git 优先 + shell fallback"两条路径，schema 一致。

**Fallback**：若 `truncateDiffContent` import 失败（dist 未构建等）→ 脚本退化到 byte-cap (`rawDiff.slice(0, 200000)`) 兜底，**仍是真实 patch hunk**。

### Step 4：写入 diff-context 文件

写入 `.tinkerman/reviews/.diff-context.md`，schema：

```markdown
---
base: <BASE_BRANCH commit hash>
head: <HEAD commit hash>
file_count: <N>
total_added: <N>
total_removed: <N>
truncated: <true|false>
source: shell_with_truncate_lib
---

## Diff Stat
<git diff --stat output>

## Diff Content
<truncated patch content with @@ hunk markers + ---/+++ headers>
```

frontmatter 7 字段全部必需；`source` 字段值固定为 `shell_with_truncate_lib`（明示这是脚本化路径，区别于早期"forge_git" / "shell_fallback"两条历史路径）。

## Why Narrative Summary is Forbidden

`## Diff Content` 段**必须**含 unified diff hunk 文本，以下三者至少出现其一：

- `@@ -<base_line>,<count> +<head_line>,<count> @@` hunk header
- `--- a/<path>` 文件源头
- `+++ b/<path>` 文件目的

**禁止**把 `## Diff Content` 段替换为 narrative summary，例如：

```markdown
## Diff Content

See forge_git diff-content output. Single file change: agents/spec-check.md.
Key changes:
- Removed background: true from frontmatter
- Renamed Step 0.5 from "Mandatory Context Read" to "Optional Context Read..."
```

这种 narrative pattern 会导致 review subagent 看不到具体行级别改动，进而需要重新调用 `forge_git` 自行获取真实 diff，消耗 turn 预算导致评审截断。

历史背景：subagent-foreground-truncation Stage 4 Real Smoke (commit `37b329a`, 2026-05-17) 中 quality-check 因 `.diff-context.md` 含 narrative summary 而 truncate 到单行 preamble。修复路径见 `.kiro/specs/forge-review-diff-context-fidelity/`。脚本化主路径 + 契约测试守护从根本上消除该退化模式。

## 截断策略

- diff ≤1500 行：完整注入
- diff >1500 行：按文件优先级截断（`truncateDiffContent` 内部逻辑）
- 截断后附注省略文件列表，agent 可对存疑项用 Read 深入验证（最多 3-5 次）
- frontmatter `truncated: true` 字段标记本次 review 触发了截断

## 推荐配置

`scripts/init.sh` 自动配置 tinkerman-context MCP，但本脚本**不依赖** MCP 运行时 — 复用的是 compiled JS 中的 pure function。MCP 仅在主 agent 想交互式调用 `forge_git(diff-content)` 时使用，与本步骤无关。
