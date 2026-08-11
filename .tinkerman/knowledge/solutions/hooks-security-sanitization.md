---
title: "Hook 脚本安全加固：allowlist + 输入净化 + 文件校验"
tags: ["security", "hooks", "shell-injection", "allowlist", "sanitization", "validation"]
date: "2026-05-12"
confidence: 0.9
---

## Problem Pattern

Hook 脚本中存在三类安全漏洞：(1) CI 命令允许正则匹配绕过 allowlist；(2) 从 YAML/Markdown 解析的字符串未净化直接用于文件名构造；(3) 读取外部文件内容前不校验完整性。

**Trigger**: hook 脚本执行 `grep -qE` 做命令白名单检查、`slug`/`phase` 变量从 `.tinkerman/status.md` 提取后拼接路径、`cat` 读取 snapshot 文件。

**Impact**: 命令注入、路径遍历、snapshot 投毒。

## Solution

1. **Allowlist**: 用 `case` 语句 + 空格分隔列表替代 `grep -qE` 正则匹配。正则可被 `.` 等通配符绕过，`case` 是精确匹配
2. **输入净化**: `tr -cd 'a-zA-Z0-9_-'` 移除所有非安全字符后再拼接文件名
3. **文件校验**: 读取前检查文件头标识（如 `^slug=`），无效则删除并 exit 0
4. **永不阻断**: `trap 'exit 0' ERR` 确保 hook 失败不阻塞 Claude 正常流程

## Pitfall Record

- **P0**: `grep -qE` 正则允许 `npm run check; rm -rf /` 通过 → 改用 `case` 精确匹配
- **P0**: `slug` 从 YAML frontmatter 提取后含引号/空格 → `tr -cd` 净化
- **P0**: postcompact.sh 先 `cat` 再 `rm` snapshot → 无校验 → 添加 header check

## Decision Rationale

- `case` vs `grep -qE`: 安全场景选精确匹配，不信任正则
- `trap 'exit 0' ERR`: compaction 是关键操作，hook 失败不应阻断
- 净化 vs 验证: 净化（移除危险字符）更适合 shell 脚本场景，验证（白名单检查）更适合应用层

## Reusable Pattern

**Pattern: Shell hook 安全三件套**
```bash
# 1. Allowlist with case
ALLOWED="cmd1 cmd2 cmd3"
case " $ALLOWED " in *" $input "*) ;; *) exit 0 ;; esac

# 2. Sanitize user-derived strings
safe=$(printf '%s' "$raw" | tr -cd 'a-zA-Z0-9_-')

# 3. Validate before consuming
if ! grep -q '^expected_header=' "$file"; then rm -f "$file"; exit 0; fi
```
