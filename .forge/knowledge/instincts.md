---
updated: "2026-05-12"
---

## 模式列表

### 正则 `.test()` 永远使用内联正则，不用全局正则

**Confidence_Score**: 0.85
**Tags**: regex, testing, bug-prevention
**来源**: ship-delivery-pure-functions

`/g` flag 正则的 `.test()` 方法会残留 `lastIndex`，导致同一字符串在连续调用中返回不同结果。永远用 `/pattern/.test(str)` 内联正则，或在调用前手动重置 `lastIndex = 0`。此 bug 在属性测试（fast-check 多次迭代）中最容易暴露。

### 外部命令使用纯函数构建器 + execFileSync

**Confidence_Score**: 0.8
**Tags**: security, command-injection, pure-function
**来源**: ship-delivery-pure-functions

构造外部命令（Git、Docker、SSH）时，使用纯函数返回 `{ executable, args }` 描述符，通过 `execFileSync(executable, args)` 执行。不在任何地方拼接命令字符串。入口处调用 `validate()` 做输入验证，使用 reject 策略（不 sanitize）。

### 安全验证需要多字符序列检查

**Confidence_Score**: 0.7
**Tags**: security, validation, input-checking
**来源**: ship-delivery-pure-functions

字符白名单无法拦截多字符攻击序列（如 `..`、`@{`、`.lock`）。输入验证必须同时包含字符级和序列级检查。对于 Git 分支名，还需检查首尾字符限制。

### Shell hook 安全三件套：case allowlist + tr 净化 + 读取前校验

**Confidence_Score**: 0.9
**Tags**: security, hooks, shell, allowlist, sanitization
**来源**: hooks-security-sanitization, ccbp-phase2-worktree-gitignore

Hook 脚本中：(1) 用 `case` 语句精确匹配 allowlist，不用 `grep -qE` 正则；(2) 外部输入用 `tr -cd 'a-zA-Z0-9_-'` 净化后再拼接路径/文件名；(3) `cat` 外部文件前检查 header 标识，无效则删除+exit 0。

### .claude/ 被 gitignore 时用 git add -f 跟踪

**Confidence_Score**: 0.85
**Tags**: git, gitignore, worktree, .claude
**来源**: ccbp-phase2-worktree-gitignore

`.claude/` 整体在 .gitignore 中排除。需要版本控制的文件（agents/、rules/、hooks/scripts/）必须 `git add -f`。忘记 -f 会导致 merge 时文件丢失。
