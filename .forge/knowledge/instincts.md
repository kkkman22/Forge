---
updated: "2026-04-29"
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
