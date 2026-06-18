---
layer: spec-check
topic: mcp-compression-delegation
date: 2026-06-18
status: pass
severity_counts: { p0: 0, p1: 0, p2: 1, p3: 3 }
---

# spec-check — mcp-compression-delegation

## 需求实现核对

- **需求1(删除RTK)**: pass — `isRtkAvailable`/`trimWithFallback`/`rtkCompress` 从 output.ts 移除,forge-exec.ts:22 import 改为仅 `trimCommandOutput`,调用点改为直接 `trimCommandOutput(...)`,`test/mcp/forge-exec-rtk.test.ts` 已删除。
- **需求2(删除read_cached)**: pass — `forge-read-cached.ts`/`read-cache.ts`/`read-cache-hash.ts` 三个源文件删除,server.ts 注销 import+调用,6 处 skills 引用改为 Grep/forge_read 引导并加"已移除"说明,相关测试全删,path-validator.ts 注释同步。
- **需求3(forge_exec安全层)**: pass — `EXACT_ALLOWED_COMMANDS`/`isCommandAllowed`/`containsShellMetachars`/`execCommandTracked`/`reapProcessTree`/`formatFailureOutput`/`legacyTypedReplacementWarning` 全部原样保留(D5遵守),工具名/schema 未改,向后兼容。
- **需求4(init.sh移除RTK)**: pass — `install_companion "Headroom + RTK"` 改为 `"Headroom"`,摘要表 for 循环去掉 `"rtk"`,check-companions.mjs 的 COMPANIONS 数组与注释移除 RTK 条目。
- **需求5(文档定位)**: pass — context-budget.md 标题从"五层防御"改"安全执行+内容隔离",新增"压缩职责分工"表,MCP 工具表移除 forge_read_cached 行、forge_exec 描述改为"安全执行+Iron Law",skills 5 层重编号为 4 层。

## Findings

- [P3|0.8] R-001: output.ts:14 文件头注释 `**Validates: Requirements 2.3, 2.4, 2.5**` 是过时标签 — 本 spec 无 2.x 需求(疑似从其他 spec 复制残留)。 @ src/mcp/trimmers/output.ts:14
- [P3|0.7] R-002: `formatFailureOutput` 现在仅被 trimCommandOutput 内部调用,无独立 export,但它仍是 Iron Law 的核心实现且语义正确。非缺陷,提示注意:若未来想单独测试它需 export。 @ src/mcp/trimmers/output.ts:40
- [P2|0.5] R-003: context-budget.md 新"四层运行时防护"与 integration test 注释存在叙事不一致 — 测试注释说"Layer 2 (Phase boundary budget)...was removed with it",但 context-budget.md 仍保留"阶段隔离"为 Layer 1 并未删除。 @ test/context-explosion-defense.integration.test.ts:8
- [P3|0.9] R-004: 无关噪音 — `.forge/knowledge/tool-health.md`(+6 行 prune-sessions 日志)和 `README.md`(模块数 305→302、测试数 8251→8194)是自动化脚本产物/计数更新,与 spec 无功能关系,属预期副作用非 scope creep。

## 场景覆盖

- **Iron Law 保障**: 完整。`trimCommandOutput` 入口第一分支 `if (exitCode !== 0) return formatFailureOutput(stdout, stderr)` 保留。双层保险:D2(Headroom-absent 时 forge_exec 兜底)+ D4(Headroom present 时 protected:error_output)成立。
- **安全层完整性**: 完整。allowlist/metachar/进程清理全部原样保留,签名未改,adversarial-mcp-boundaries 测试覆盖的目标函数零改动。

## Scope 审查

- **无关改动**: tool-health.md(日志追加)、README.md(统计数字更新)、.forge/features/(feature 索引自动生成)、manifest.json(sha256 自动重算)、dist/*(编译产物) — 均为自动化生成或计数同步,非手工 scope 扩展。
- **scope creep**: 无。所有改动严格落在 requirements.md 的 5 个需求内。非目标段全部遵守 — forge_exec 安全层零重构,forge_git/forge_read 零改动,trimCommandOutput 保留说明 Headroom 仍可选。

## 结论

改动忠实实现 spec 的 5 个需求,删除彻底(无残留死代码引用,仅留"已移除"说明性注释),保留部分(Iron Law + 安全层)原样无损。无 P0/P1 阻塞项,可发布。
