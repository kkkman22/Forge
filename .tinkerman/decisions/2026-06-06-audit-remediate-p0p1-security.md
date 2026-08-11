---
date: "2026-06-06"
topic: "audit-remediate-p0p1"
perspective: "security"
tier: "full"
phase: "decide-round1"
---

# Security Perspective — Audit Remediate P0/P1

## Core Conclusion

严格 allowlist 方案正确，但实现时必须：(1) 路径规范化用 realpath，(2) 命令 allowlist 包含参数约束，(3) 所有安全检查默认 fail-closed。

## Threat Model (Post-Fix Residual)

- **OWASP A01 Injection**: P0-2 修复后需验证 allowlist 覆盖所有子命令路径
- **OWASP A05 Access Control**: P0-1 修复后路径规范化需处理 .., symlink, macOS /private
- **OWASP A06 Security Misconfiguration**: P1-2/P1-3/P1-8 是安全控制静默失效

## STRIDE Analysis

- **Tampering**: allowlist 子命令如果允许参数注入（git log --output=/etc/passwd），严格 allowlist 也可被绕过
- **Info Disclosure**: 路径比较必须 realpath + normalize，否则 .. / symlink 绕过
- **DoS**: node -e 无资源限制（可接受，记录为已知限制）
- **Elevation**: P1-7 publish gate 不完整 = 有漏洞包可发布到 npm

## Security Requirements

1. **路径规范化**: realpath + normalize + 前缀匹配，处理 symlink/..macOS /private
2. **命令参数约束**: allowlist 不只是命令名，必须限制参数模式（regex）
3. **Fail-closed**: settings.json 缺失时拒绝所有操作，默认 deny

## Adversarial Test Requirements

- symlink 链指向 allowlist 外路径
- .. 遍历
- macOS /private 别名
- 命令参数注入（;、&& 替代）
- settings.json 缺失/损坏
- allowlist 外 MCP 工具调用

## Assumptions

Forge 以 first-party MCP 工具运行。威胁模型是用户侧（恶意 prompt/script），非远程攻击者。
