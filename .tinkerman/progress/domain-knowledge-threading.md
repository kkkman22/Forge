# Progress — domain-knowledge-threading（切片 B：领域知识全栈接线）

> Spec: `.tinkerman/specs/domain-knowledge-threading/` (locked)
> Decision: `.tinkerman/decisions/2026-06-27-domain-example-reference-impl.md` §7 (slice B)
> Branch: `feat/domain-knowledge-threading-sliceB`

## 背景与目标

整条 pack 栈（`loadPackRegistry` → `parseEnabledPacks` → `EnabledPacks` →
`loadContexts`/`loadGlossary`/state-machine）已是完整但**零接线**的纯库：没有任何
runtime 路径读 `.tinkerman/config.md` 的 `packs:` 字段，四个 phase（decide/plan/build/review）
都不消费 pack 数据，glossary 检查仍读扁平 `.tinkerman/glossary.md`，`src/index.ts` 不导出
任何 pack 机制，R4.5.5（`/forge plan` 消费 state-machine）的复数 loader 从未交付。

切片 B = 最后一公里接线：runtime loader + R4.5.5 loader + 公共导出 + bundle composer +
四 phase 注入，使启用的 PMS pack 真正塑造 decide/plan/build/review，且 Zero-Pack-Zero-Impact
保持。

## Wave 进度（全部完成）

- [x] **Wave 1** — T1 `loadEnabledPacks`(runtime.ts), T2 `loadStateMachineDefinitions`(registry.ts, R4.5.5), T3 `composeDomainKnowledgeBundle`(domain-bundle.ts), T4 公共 API 导出
- [x] **Wave 2** — T5 zero-pack 不变式验证, T6 plan R4.5.5 注入 + atomic-task-format 更新, T7 decide/build/review 注入
- [x] **Wave 3** — T8 全量验证 + DoD, T9 PR + CI

## §3.5 Final Validation

`npm run check` **EXIT=0**：733 files / 9038 passed | 3 skipped, 0 failed。
`tsc -p tsconfig.build.json --noEmit` **EXIT=0**（新模块进 dist 无错）。
`typedoc`（treatWarningsAsErrors）**EXIT=0**，0 warnings。
`node scripts/check-public-api.mjs`：barrel 20/20 statements，public API OK。

## REQ 覆盖（9 task → 7 REQ）

| REQ | 状态 | 交付 |
|-----|------|------|
| REQ-1 runtime enabled-packs loader | ✅ | `src/pack/runtime.ts` `loadEnabledPacks` |
| REQ-2 pack-aware state-machine loader (R4.5.5) | ✅ | `src/state-machine/registry.ts` `loadStateMachineDefinitions` |
| REQ-3 公共 API 导出 | ✅ | `src/index.ts` + `src/state-machine/index.ts` 重导出 |
| REQ-4 bundle composer | ✅ | `src/pack/domain-bundle.ts` `composeDomainKnowledgeBundle` |
| REQ-5 phase injection (decide/plan/build/review) | ✅ | 四 instructions.md + R4.5.5 plan Task Breakdown 规则 |
| REQ-6 glossary scope-bounded | ✅ | 仅导出 loadGlossary，不改 runGlossaryCheck（slice C） |
| REQ-7 zero-pack verify | ✅ | `test/pack/runtime-zero-pack.test.ts`（counting fs） |

## INV 验证（全局不变式）

- **INV-1 Zero-Pack-Zero-Impact** ✅：无 pack 时 loadEnabledPacks + composeDomainKnowledgeBundle
  注入**零**领域数据（contexts/glossary/state-machines），两种场景验证（config.md 无 packs 字段 /
  config.md 缺失）。既有 `zero-pack-invariant.test.ts` 12 测试仍绿。**澄清**：INV-1 管的是
  *注入的领域数据*，不是 manifest 发现的 structural 开销（loadPackRegistry 读 pack.yaml 是合法的）。
- **INV-2 进 dist** ✅：三个新模块（runtime.ts / registry.ts / domain-bundle.ts）是生产 src/，
  emit 到 dist，进 `npm run check` / typedoc / `tsc -p tsconfig.build.json`，无需 slice A 的排除。
- **INV-3 纯+注入 fs** ✅：所有新 loader 组合现有纯函数 + 注入 FileSystem，无 node:fs 直接导入。
  **关键**：registry.ts 用本地结构契约（RegistryFileSystem/RegistryEnabledPacks）而非 import
  `../pack/types.js`，保持 state-machine 模块 pack-agnostic（不破坏 slice A 的独立 domain tsc）。
- **INV-4 向后兼容** ✅：注入纯加性；历史 plan/decision/spec/review 仍有效。

## 关键设计决策与意外发现

1. **registry.ts 跨边界 import 破坏 slice A**（T2 后发现）：原版 import `../pack/types.js` 的
   `EnabledPacks`/`FileSystem`，导致 domain tsconfig（include `../state-machine/**`）被迫拉取
   `src/pack/types.ts` → TS6307。修复：本地结构契约（duck typing），real pack/types 形状结构兼容。
2. **dist-resync.sh 用错 tsconfig**（T8 发现）：bare `npx tsc`（root tsconfig 含 src/domain）emit
   domain 参照码到 dist，破坏 domain-not-in-dist gate（slice A INV-3）。修复：改用
   `tsconfig.build.json`，与 build-dist.sh / ci.yml / cross-version-check.yml 一致。
3. **barrel 20-statement 预算**：src/index.ts 已 20/20。新导出合并进既有 aggregated re-export
   block（非新 export 语句），保持 20/20。
4. **contract.skill-function-sync 双向**：phase instructions 引用函数 ↔ registry 条目，T6/T7 必须
   同步落地（registry 声明 4 phase，instructions 必须都有引用）。
5. **typedoc treatWarningsAsErrors**：registry.ts 的本地接口若不 export，typedoc 报"referenced
   but not included"。修复：export 三个契约接口（它们本就是 public 签名的一部分）。

## Out of Scope（推迟 slice C）

- 桥接 layered `loadGlossary` 进 `runGlossaryCheck` enforcement（REQ-6 明确推迟）。
- 迁移 `.tinkerman/glossary.md` 到分层模型。
- 其余 7 个 PMS bounded context 参照码（slice A 只 ship reservations）。
- banned-patterns / lint-rules / scenarios pack 类别接线。
- mutation testing wiring（mutation_critical_modules）。
