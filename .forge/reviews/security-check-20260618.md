---
layer: security-check
topic: mcp-compression-delegation
date: 2026-06-18
status: pass
severity_counts: { p0: 0, p1: 0, p2: 0, p3: 0 }
---

# security-check — mcp-compression-delegation

## Findings

无。

## 安全控制完整性

- **命令 allowlist**: 完整 — EXACT_ALLOWED_COMMANDS, ALLOWED_NPM_RUN_SCRIPTS, ALLOWED_GIT_SUBCOMMANDS, isCommandAllowed, isCommandDenied, containsShellMetachars, isSimpleCommand 全部原样保留 (src/mcp/tools/forge-exec.ts:95-236)
- **路径校验**: 完整 — path-validator.ts 仅删除 forge-read-cached 的注释引用;validateSinglePath/validatePaths 逻辑零改动;forge-read.ts 仍在 3 处调用 validatePaths (forge-read.ts:268,381,507)
- **进程清理**: 完整 — execCommandTracked/reapProcessTree/getDescendants/killProcessTree 链路原样保留;RTK 的 spawn("rtk",...) 已彻底删除,src/mcp/ 下无残留 spawn 调用(仅 forge-exec.ts:362 的 process-group-tracked spawn 保留)
- **注入面**: 无新增 — RTK 子进程删除后反而缩小了攻击面;execCommand/execCommandTracked 的 simple-command array-mode + sh -c fallback 架构未变
- **deny rule glob 匹配**: 完整 — readDenyPatterns/isCommandDenied + globRegexCache 未改动
- **敏感数据泄露**: 无 — output.ts 重写仅删除 RTK 路径,trimCommandOutput/formatFailureOutput 保留;Iron Law (失败输出零压缩) 仍生效

## 验证细节

- **server.ts**: 工具数 4→3(forge_exec/forge_git/forge_read + typed-capabilities),注册顺序与 import 清理干净,无 dangling import
- **删除确认**: src/mcp/read-cache.ts / read-cache-hash.ts / tools/forge-read-cached.ts 物理删除;src/mcp 下无 isRtkAvailable/trimWithFallback/registerForgeReadCached/read-cache 残留引用
- **output.ts**: 仅保留 trimCommandOutput + formatFailureOutput,删除 isRtkAvailable/rtkCompress/trimWithFallback/spawn/execFile import;无密码/token/api_key 硬编码
- **测试同步**: server.integration.test.ts 期望工具数 10→9,移除 forge_read_cached;path-validator.test.ts 仅改注释

## 安全测试结果

- **adversarial-mcp-boundaries**: pass (7 tests, 19ms)
- **security-branches**: pass (23 tests, 5ms)
- **合计**: 30/30 pass, 261ms

## 结论

此次改动是纯删除(移除 RTK 子进程集成 + forge_read_cached 去重缓存)。所有安全控制(命令 allowlist、shell-metachar 防注入、路径遍历校验、进程树清理、deny-rule glob 匹配、失败输出 Iron Law)均原样保留。删除 spawn("rtk") 实际上**缩小**了命令注入面。path-validator 作为共享模块继续保护 forge_read。无 P0/P1/P2/P3 问题,建议合并。
