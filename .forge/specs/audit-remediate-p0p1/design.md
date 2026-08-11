---
feature: audit-remediate-p0p1
layout: design
created: 2026-06-06
---

# Design — Audit Remediate P0/P1

## 架构概述

10 项修复分为 4 个执行阶段，按依赖关系排序。每个阶段的产出是下一阶段的前置条件。

```
Phase 1 (安全 + 独立)     Phase 2 (dist 同步)      Phase 3 (registry + coverage)   Phase 4 (CI + hook)
P0-1 forge_read 安全       P1-1 dist:resync          P1-2 allowlist parity           P1-7 CI publish gate
P0-2 forge_exec allowlist  P1-4 plugin dist 打包     P1-5 coverage 补充              P1-8 Stop hook 127
P1-3 router ESM
P1-6 postinstall
```

## 设计决策

### D1: MCP 安全边界 — 严格 Allowlist（不用沙箱）

**forge_read（P0-1）**：
- DANGEROUS_SCRIPT_PATTERNS 扩展为覆盖所有文件系统/进程/运行时反射 API
- path-validator.ts 增加 `realpathSync` + symlink 检测
- reject 策略：不在白名单 → 拒绝，不 sanitize

**forge_exec（P0-2）**：
- 新增 `READONLY_COMMAND_ALLOWLIST` 硬编码常量
- `isCommandAllowed(command)` 解析命令首词匹配
- shell 元字符检测从 4 项扩展到完整覆盖
- settings.json deny 为补充层，非主要防线

### D2: Dist 同步 — 完全重生成

- `npm run dist:resync`（即 `tsc` + 复制）重生成全部 dist/
- 不做增量修补 — 100+ 文件漂移使增量不可靠
- CI gate（check-dist-sync.mjs）确保后续不再漂移

### D3: Allowlist — 直接修补 + Parity Test

- 手动补 init、review-comment-bitbucket 到 ALLOW_LIST
- 新增 parity test：读 registry.toml sections 并与 ALLOW_LIST 长度断言
- SSOT 生成链为 follow-up，本轮不引入新构建步骤

### D4: Router ESM — import.meta.url 迁移

- `require("node:fs")` → `import { readFileSync } from "node:fs"`
- `__dirname` → `new URL('../templates/router-intents.md', import.meta.url)`
- catch 块增加结构化日志（console.error with context）

### D5: Plugin Dist — 补复制 + Contract Test

- build-dist.sh PLUGIN_DIST 段增加 `cp -r hooks/` 和 `cp .mcp.json`
- Contract test 断言 dist-plugin/ 包含 hooks/hooks.json 和 .mcp.json

## 错误处理策略

| 位置 | 错误场景 | 处理 |
|------|---------|------|
| forge_exec allowlist | 命令不在白名单 | 返回 isError: true + 明确拒绝信息 |
| forge_exec settings.json | 文件缺失 | fail-open（allowlist 不依赖配置） |
| forge_read script | 危险模式匹配 | 返回 isError: true + 模式名 |
| path-validator | symlink 指向项目外 | 返回 false |
| router intent loader | 文件缺失 | 结构化日志 + 空数组降级 |
| dist sync | 漂移检测失败 | CI 阻断（exit 1） |
| plugin dist | 文件缺失 | contract test 失败 |

## 变更文件清单

| 文件 | 变更类型 | REQ |
|------|---------|-----|
| src/mcp/tools/forge-read.ts | 修改 | P0-1 |
| src/mcp/tools/forge-exec.ts | 修改 | P0-2 |
| src/mcp/tools/path-validator.ts | 修改 | P0-1 |
| test/mcp/forge-read.test.ts | 修改 | P0-1 |
| test/mcp/forge-exec.test.ts | 修改 | P0-2 |
| src/router.ts | 修改 | P1-3 |
| test/router/ | 修改 | P1-3 |
| src/forge-dispatcher/allowlist.ts | 修改 | P1-2 |
| test/forge-dispatcher/ | 新增 | P1-2 |
| scripts/build-dist.sh | 修改 | P1-4 |
| test/plugin-dist/ | 新增 | P1-4 |
| vitest.config.ts | 可能修改 | P1-5 |
| test/ | 新增用例 | P1-5 |
| package.json | 修改 | P1-6 |
| .github/workflows/ci.yml | 修改 | P1-7 |
| hooks/hooks.json | 修改 | P1-8 |
| dist/src/** | 重生成 | P1-1 |
