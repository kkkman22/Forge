---
date: "2026-06-06"
topic: "audit-remediate-p0p1"
status: "pending-confirmation"
tier: "full"
deciders: ["Forge maintainer"]
related_adrs:
  - "2026-05-28-mcp-tool-hook-audit"
  - "2026-05-12-plugin-distribution"
  - "2026-05-13-skill-count-deviation"
---

# Decision: Audit Remediate P0/P1

## Context

代码审核报告发现 2 P0（MCP 安全边界失效）+ 8 P1（dist 漂移、registry 漂移、router ESM、plugin dist、coverage、postinstall、CI gate、stop hook）。需要决定修复策略和执行计划。

## Product Decision

**单次发布，4 阶段执行**。P0 是唯一积极安全风险（MCP 绕过），但 P1 修复依赖关系决定了执行顺序。所有 10 项在同一 PR 中交付。

**Dist sync 为完全重生成**（非增量），该单项风险为 High，但 CI gate 自动化验证可控。

## Technical Decision

### 执行阶段（按依赖关系排序）

**Phase 1 — 安全 + 独立修复**（无依赖）：
1. P0-1: `forge_read` 禁止 require('fs')/import()/Buffer/WebAssembly，保留 deny-list + 硬编码限制
2. P0-2: `forge_exec` 硬编码只读命令 allowlist，shell 重定向硬拒绝
3. P1-3: router.ts 用 import.meta.url 替代 require/__dirname
4. P1-6: 移除 postinstall，改为 forge init 显式入口

**Phase 2 — Dist 同步**（依赖 Phase 1 编译）：
5. P1-1: `npm run dist:resync` 完全重生成 dist/
6. P1-4: build-dist.sh 补 cp hooks/ + .mcp.json，补 contract test

**Phase 3 — Registry + Coverage**（依赖 Phase 2 dist 稳定）：
7. P1-2: 补 init + review-comment-bitbucket 到 allowlist.ts，补 parity test（registry count == ALLOW_LIST length）
8. P1-5: 补 branch coverage 到 79%+

**Phase 4 — CI + Hook 基础设施**（依赖所有上述）：
9. P1-7: publish job 增加 needs: [check, security-audit, plugin-validate]
10. P1-8: 统一 hook 配置来源，清理 persistent-loop.sh 陈旧引用

### SSOT Pipeline（延迟）

SSOT 生成链（registry.toml → allowlist.ts → docs）不纳入本轮。Phase 1 用直接修改 allowlist.ts + parity test。SSOT 作为 follow-up 任务。

### MCP 安全实现策略

**forge_read（P0-1）**：
- validateScript 禁止列表增加：require('fs')、import()、Buffer、WebAssembly、process.binding
- 路径校验用 realpathSync + normalize，处理 symlink/..macOS /private
- 失败测试：/etc/passwd、~/.ssh/id_rsa、../outside、symlink 指向项目外

**forge_exec（P0-2）**：
- 硬编码 READONLY_COMMAND_ALLOWLIST：npm test/lint/typecheck/run、vitest、tsc、biome、node --check、git diff/status/log/show
- 硬拒绝 shell 元字符：; && | > < & 以及 $() 反引号
- settings.json deny 为补充层，非主要防线
- fail-closed：配置缺失时拒绝所有操作

## Security Decision

- 严格 allowlist（不用沙箱）
- 路径规范化：realpath + normalize + 前缀匹配
- 命令参数约束：allowlist 不只是命令名，需限制参数模式
- fail-closed 原则：所有安全检查默认 deny
- adversarial test suite 覆盖：symlink 逃逸、路径遍历、参数注入、配置缺失/损坏

## Veto Record

无否决。

## Critic Resolution

| Critic Issue | Resolution |
|---|---|
| Batch vs Phase 冲突 | 采用 4 阶段模型，单次发布 |
| forge_read 接口冲突 | Phase 1 用 deny-list + 硬编码限制，预定义操作为 future work |
| forge_read deny-list 脆弱性 | adversarial test suite 包含脚本逃逸测试 |
| SSOT 过度工程 | 延迟到 follow-up |
| dist sync 假设 | 确认为完全重生成，单项风险 High |

## Risks

| Risk | Level | Mitigation |
|------|-------|-----------|
| dist sync 完全重生成引入回归 | High | CI gate + npm run check 全量验证 |
| forge_read deny-list 绕过 | Medium | adversarial tests + future 预定义操作迁移 |
| allowlist 遗漏合法命令 | Medium | parity test + smoke test |
| router ESM 迁移破坏编译 | Low | tsc --noEmit 先验证 |
