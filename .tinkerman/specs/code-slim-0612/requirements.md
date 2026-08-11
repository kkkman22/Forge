---
feature: code-slim-0612
title: 全项目代码精简与重构
status: completed
tier: full
work_nature: refactor
variant: requirements-first
brownfield: true
decision: .tinkerman/decisions/2026-06-12-code-slim.md
adr: ADR-0008
status_note: "All packages delivered and verified. Package 1 (T1 deprecated.ts deleted; T2 idempotent barrel re-export cleaned). Packages 2 R10 dual-verify completed: T3/T4/T5 all verified — codebase is already lean, no dead code found (INV-1~6 + barrel-file enforcement prevented drift). Package 3 T6 (mcp internal fn merge) verified 2026-06-14 with user confirmation: forge-exec.ts has only 4 private functions (escapeRegexChar/normalizeCommand/splitSimpleCommand/reapProcessTree), all with distinct signatures/semantics — no isomorphic duplicates to merge (same conclusion as T3/T4/T5). code-slim-0612 fully complete: all 6 modules verified, no deletable dead code or mergeable duplicates anywhere in the project."
---

# Requirements — 全项目代码精简与重构

## 用户故事

作为 Forge 维护者，我希望移除冗余代码、死代码与重复实现，降低长期维护成本，**同时保证所有对外行为完全不变**。

## 核心目标

等价 refactor：精简内部实现，对外行为零变化。度量=每 PR review P0/P1 回归数 ≤ 基线（非 LOC 删减量）。

## 全局不变式（所有子任务必须满足，任一违反 = 阻断 ship）

| ID | 不变式 | 验证 |
|----|--------|------|
| INV-1 | 公开 API / CLI 退出码与 stdout / MCP tool 名称与参数 / Bitbucket marker 正则与 hash 算法 / `forge init` 产物——行为不变 | vitest 全绿 + 对外契约测试 |
| INV-2 | 安全控制不删除：路径 normalization（worktree-manager/sandbox-policy）、allowlist/case 分发、input reject/severity、audit+HMAC、execFileSync 纯函数构造 | grep diff 无 `throw/reject/deny/normalize/allowlist/case` 删除行未配等价替换 |
| INV-3 | 被 scripts/ import 的 `dist/src/*.js` 路径不移动/不重命名（scripts 是 dist 真实 runtime consumer） | grep scripts/ 的 dist import 路径在 src 侧仍存在 |
| INV-4 | 安全测试不删除：`*-parity.test.ts`、`test/security/*`、`adversarial-mcp-boundaries.test.ts` | git diff 无这些文件删除 |
| INV-5 | 每个改动验证：`npx tsc --noEmit && npx vitest run` 全绿（R11，缺一不可） | bash exit 0 |
| INV-6 | 每个子任务结束 `dist/src/**` 与 src 同步（R6） | `bash scripts/check-dist-sync.mjs` 通过 |

## 子任务需求

### REQ-1：删除 deprecated.ts（死 shim）

**Current State**：`src/deprecated.ts`（152 行）是 v2.4→v2.5 迁移 shim，frontmatter 标注 `@deprecated Will be removed in v2.5.0`，当前版本 v3.4.0（契约已到期）。唯一 caller 是 `test/barrel-file.test.ts:13`（`import * as deprecated`，仅类型断言），`src/index.ts:10` 仅为注释提及。

**Requirement**：WHEN `src/deprecated.ts` 被删除 THEN 所有非测试业务代码的编译与运行不受影响。

- AC-1.1 `grep -rn "from.*deprecated" src/` 返回空 | Verify-By: bash | Evidence: grep 输出为空
- AC-1.2 `test/barrel-file.test.ts` 移除 deprecated 相关断言（含 `:335-366` 区段）后该文件全绿 | Verify-By: vitest | Evidence: vitest exit 0
- AC-1.3 `npx tsc --noEmit` 通过 | Verify-By: bash | Evidence: tsc exit 0
- AC-1.4 dist/src 同步 | Verify-By: bash | Evidence: check-dist-sync 通过

### REQ-2：barrel re-export 冗余清理

**Current State**：多个 index.ts 同时使用 `export *` 与显式 re-export 导出同一符号（如 `src/error-recovery/index.ts:5-11` 用 `export *` 导出 7 子模块，`:12` 又显式 `export { PHASE_SEQUENCES, TEST_FILE_PATTERNS }`）。`test/barrel-file.test.ts:185` 硬编码 `expect(valueExports).toHaveLength(140)`。

**Requirement**：WHEN 幂等 barrel re-export 被删除 THEN 模块对外导出集合不变。

- AC-2.1 删除显式 re-export 前确认该符号已由 `export *` 覆盖，删除后 `tsc --noEmit` 通过 | Verify-By: bash | Evidence: tsc exit 0
- AC-2.2 `barrel-file.test.ts` 的 export 总数断言随实际删减更新（如 140 → 新值），更新后全绿 | Verify-By: vitest | Evidence: vitest exit 0
- AC-2.3 决定/schemas/review 等模块的 index.ts 逐一核验同模式 | Verify-By: manual | Evidence: 核验清单
- AC-2.4 dist/src 同步 | Verify-By: bash | Evidence: check-dist-sync 通过

### REQ-3：error-recovery 模块精简

**Current State**：`src/error-recovery/`（8 文件 1200 行），`types.ts` 有 25 个 export（高密度待核 caller）。

**Requirement**：WHEN error-recovery 内部死代码/未引用 export/同构重复被清理 THEN 该模块对外导出与行为不变。

- AC-3.1 删除任何 export 前 `grep -RIn 'import.*<sym>' src/` + 核 entry 文件确认无 production caller（R10） | Verify-By: bash | Evidence: grep 输出
- AC-3.2 同构纯函数合并须真删一边（R12），`grep -RIn 'export.*<fn>' src/` 收敛到 1 | Verify-By: bash | Evidence: grep count=1
- AC-3.3 `npx tsc --noEmit && npx vitest run` 全绿 | Verify-By: bash | Evidence: exit 0
- AC-3.4 dist/src 同步 | Verify-By: bash | Evidence: check-dist-sync 通过

### REQ-4：docs-governance 模块精简

**Current State**：`src/docs-governance/`（32 文件 2825 行），staleness/link-checker/quota 子主题独立；`root-whitelist.ts` 仅自引用 SCRIPT_NAME，疑似孤儿待 ts-prune 终验。

**Requirement**：WHEN docs-governance 死代码/疑似孤儿（经终验）被清理 THEN docs 治理对外行为不变。

- AC-4.1 `root-whitelist.ts` 删除前必须 ts-prune 或 grep 双向核验确认无外部 caller | Verify-By: bash | Evidence: 核验输出
- AC-4.2 `npx tsc --noEmit && npx vitest run` 全绿 | Verify-By: bash | Evidence: exit 0
- AC-4.3 dist/src 同步 | Verify-By: bash | Evidence: check-dist-sync 通过

### REQ-5：review-comment-bitbucket 精简（仅死代码）

**Current State**：`src/review-comment-bitbucket/`（11 文件 1559 行），wire 进 post.ts/reconcile.ts；finding-hash 是外部可观察 hash 的来源。

**Requirement**：WHEN 该模块仅删除死代码（不动 reconcile 主流程、不动 marker/hash 算法）THEN Bitbucket 评论行为不变。

- AC-5.1 不修改 reconcile 主流程、finding-hash 算法、marker 正则 | Verify-By: manual | Evidence: diff 审查
- AC-5.2 `npx tsc --noEmit && npx vitest run` 全绿 | Verify-By: bash | Evidence: exit 0
- AC-5.3 dist/src 同步 | Verify-By: bash | Evidence: check-dist-sync 通过

### REQ-6：mcp 内部小函数合并（不动 register*）

**Current State**：`src/mcp/`（12 文件 2884 行），ADR-0002 capability scope + typed-capabilities 锁定；`forge-exec.ts` 内部有 12 个小函数合并候选；read-cache/forge-exec 是 runtime 热路径。

**Requirement**：WHEN 仅合并 forge-exec.ts 内部小函数（不动 register* 入口、不动 tool 名称/参数）THEN MCP 工具行为不变。

- AC-6.1 不修改任何 `register*` 入口、tool 名称、tool 参数 schema | Verify-By: manual | Evidence: diff 审查
- AC-6.2 `npx tsc --noEmit && npx vitest run` 全绿 | Verify-By: bash | Evidence: exit 0
- AC-6.3 dist/src 同步 | Verify-By: bash | Evidence: check-dist-sync 通过

## 非目标（明确不做）

- 不改公开 API 签名 / CLI 行为 / MCP tool 契约 / Bitbucket marker·hash
- 不新增 adapter 层或抽象（与精简目标矛盾）
- 不合并签名/语义不同的同名函数（如 3 套 `parseGitLog`：recap.ts/fix-recovery.ts/git-scanner.ts）
- 不动文档治理类内容（constitution/glossary/.claude/rules 即便冗余也非代码 refactor 范围）
- 不删安全测试（INV-4）
- 不跨模块移动文件（破坏 import 路径触发 dist 风暴，违反 INV-3）

## Delta（棕地）

- **删除**：deprecated.ts、幂等 barrel re-export、经 grep+entry 双向核验的未引用 export、模块内死代码
- **修改**：barrel-file.test.ts（export 数断言）、被精简的内部实现
- **不变**：所有公开契约（INV-1）、安全控制（INV-2）、scripts dist 路径（INV-3）、安全测试（INV-4）
