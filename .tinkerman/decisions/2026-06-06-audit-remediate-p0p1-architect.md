---
date: "2026-06-06"
topic: "audit-remediate-p0p1"
perspective: "architect"
tier: "full"
phase: "decide-round1"
---

# Architecture Perspective — Audit Remediate P0/P1

## Core Conclusion

批量修复 + registry.toml SSOT 管道 + 严格 MCP allowlist。分 4 阶段执行，按依赖关系排序。

## Architecture Risks

1. **P0-1 forge_read 脚本限制**：deny-list 模式永远无法穷尽。建议将接口从"运行任意脚本"改为"选择预定义操作"（line-count | deps | imports）。
2. **P0-2 forge_exec allowlist**：settings.json 是用户可写的，恶意 LLM 输出可引导修改。建议硬编码不可覆盖的只读命令 allowlist。
3. **P1-3 router ESM**：require/__dirname → import.meta.url 迁移需确保 tsconfig module=NodeNext。
4. **P1-4 plugin dist**：build-dist.sh 漏复制 hooks/ 和 .mcp.json，需添加 cp 命令 + contract test。

## SSOT Pipeline Design

- `registry.toml` → `scripts/regen-allowlist.mjs` → `src/forge-dispatcher/allowlist.ts`
- Parity test: registry key count == ALLOW_LIST length
- allowlist.ts 变为生成产物，不再手写

## Dependency Graph

```
Phase 1 (no deps):  P0-1, P0-2, P1-3, P1-6
Phase 2 (needs P1-1 dist sync): P1-4
Phase 3 (needs P1-2 SSOT): P1-5
Phase 4 (needs all above): P1-7, P1-8
```

## Scalability

- SSOT 管道随子命令线性扩展（加 registry section → regen）
- MCP allowlist 故意不可扩展（新命令需 code review）

## Assumptions

1. registry.toml 具有权威性
2. tsconfig 可设为 NodeNext
3. forge_read 调用者可接受固定操作集
4. hooks/ 和 .mcp.json 有意包含在 plugin dist 中（build script 遗漏）
