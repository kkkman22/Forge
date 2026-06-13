---
perspective: security
topic: code-slim-0612
date: 2026-06-12
tier: full
risk_rating: 中
---

# Security 视角 — 全项目代码精简

## 核心结论
等价 refactor 风险**中等可控**——对外行为不变本身限制了攻击面扩张，但"误删安全 chokepoint"和"去重留松实现"是两类隐性回归，必须在 review 强制逐项核验。

## 风险评级
中

## 误删风险清单（附 grep 证据）
1. **路径 normalization/traversal 校验** — `src/worktree-manager.ts:52,78` 显式 throw `path traversal`；`src/sandbox-policy.ts:74` normalize + allow/deny。看似防御性冗余，删除即开路径穿越。
2. **Allowlist / case 分发** — `src/forge-dispatcher.ts`（forge-dispatcher/allowlist，13 文件命中 allowlist）；scripts 中 `archive-spec.sh:215-225` 拒绝敏感路径、`hook-check-frozen-post.sh:49` `case TOOL_NAME`。精简 case 常被合并成通配 → 越权。
3. **Input reject / severity 校验** — `src/fix-checklist.ts:35` P0/P1 reject、`spec-wave.ts:20` JSON 校验。被当"啰嗦"删掉 = 放行非法输入。
4. **Audit + HMAC 完整性** — `src/forge-dispatcher/audit-log.ts`（appendAuditLog/computeHmac/.audit-secret）。精简日志 = Repudiation 风险（R8: stub 禁止返回成功）。
5. **命令构造纯函数** — 13 文件用 `execFileSync/spawnSync`；instincts 要求 `{executable,args}` 不拼字符串。误改成 `exec(`string`)` = 命令注入。

## 去重安全陷阱
合并重复校验函数时，**两实现一严一松**：必须保留严的（如一个 reject 未知 key、另一个 silently ignore），删严留松 = 安全降级。证据：`allowlist-parity.test.ts`、`registry-parity.test.ts` 存在正是为防此漂移——精简**绝不能删 parity 测试**。

## review 安全检查点（精简 PR 必查）
1. **差量扫描**：diff 中任何删除 `throw / reject / deny / normalize / allowlist / case` 的行 → 逐行确认等价替换存在，否则 P1。
2. **execFileSync → 字符串拼接**：grep diff 中新增 `exec(`/`execSync(string`，禁止出现（注入）。
3. **测试不删**：`test/security/*`、`*-parity.test.ts`、`adversarial-mcp-boundaries.test.ts` 不在精简删除范围；删测试 = 拆掉安全护栏。

## STRIDE 速评
- Spoofing=低（不改认证）
- Tampering=**中**（allowlist/normalization 误删即数据完整性破口）
- Repudiation=**中**（audit/HMAC 删除则不可追溯）
- InfoDisc=低（错误信息已脱敏）
- DoS=低（无新资源消耗面）
- Elevation=**中**（chokepoint stub 若变 no-op → 提权路径）
