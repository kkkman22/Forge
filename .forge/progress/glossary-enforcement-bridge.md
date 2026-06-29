# Progress — glossary-enforcement-bridge（切片 C：glossary enforcement 桥接）

> Spec: `.forge/specs/glossary-enforcement-bridge/` (locked, 5 REQ, 5 INV)
> Branch: `feat/glossary-enforcement-sliceC`
> 来源: slice B `.forge/specs/domain-knowledge-threading/requirements.md` REQ-6 (deferred)

## 背景与目标

Slice B 的 REQ-6 明确 deferred："桥接 layered `loadGlossary` 进 `runGlossaryCheck` enforcement"。
调研确认 advisory/enforcement 割裂：slice B 让 phase **advisory 注入**看到 pack glossary 术语
（只读摘要），但 **enforcement 仍只读扁平 `.forge/glossary.md`**——pack 里定义的术语不参与冲突检测。
本切片用 `mergeGlossaries`（flat 主权 + pack 补充）+ `loadEnforcementGlossary`（单一加载器）闭合割裂。

## Wave 进度（全部完成）

- [x] **Wave 1** — T1 `mergeGlossaries`(merge.ts), T2 `loadEnforcementGlossary`(enforcement.ts), T3 公共 API 导出
- [x] **Wave 2** — T4 zero-pack 不变式验证, T5 phase instructions + function-contracts 接线
- [x] **Wave 3** — T6 全量验证 + DoD, T7 PR + CI

## §3.5 Final Validation

`npm run check` **EXIT=0**：737 files / 9061 passed。
`tsc -p tsconfig.build.json --noEmit` **EXIT=0**。
`typedoc`（treatWarningsAsErrors）**EXIT=0**，0 warnings。
`check-public-api.mjs`：barrel 20/20。

## REQ 覆盖

| REQ | 状态 | 交付 |
|-----|------|------|
| REQ-1 mergeGlossaries | ✅ | `src/glossary/merge.ts` — flat 主权，pack 补充，同名/alias 跳过，空 pack=identity |
| REQ-2 loadEnforcementGlossary | ✅ | `src/glossary/enforcement.ts` — 组合 ensureGlossaryExists + loadEnabledPacks + loadGlossary + merge |
| REQ-3 公共 API | ✅ | `src/index.ts` 重导出（barrel 保持 20/20，152 value exports） |
| REQ-4 phase 接线 | ✅ | spec/decide/plan/grill/learn function-contracts + instructions 更新 |
| REQ-5 zero-pack 验证 | ✅ | `test/glossary/enforcement-zero-pack.test.ts`（counting fs，identity，零 pack 读） |

## INV 验证

- **INV-1 Zero-Pack-Zero-Impact** ✅：无 pack → enforcement glossary 是 flat 字节相同，零 pack 读。
  既有 glossary-hook / registry 测试全绿（未改 runGlossaryCheck/detectConflict）。
- **INV-2 进 dist** ✅：merge.ts/enforcement.ts 是生产 src/，正常 emit，typedoc 通过。
- **INV-3 纯+注入 fs** ✅：mergeGlossaries 纯函数；loadEnforcementGlossary 注入 fs，无 node:fs 直接导入。
- **INV-4 向后兼容** ✅：扁平 glossary.md 仍是写入主权源 + enforcement 基线。
- **INV-5 flat 主权** ✅：pack 术语永不写回 flat；同名/alias 撞 flat 时 flat 赢（pack 跳过，不覆盖）。

## 关键设计决策与意外发现

1. **fs 契约鸿沟（sync vs async）**：`ensureGlossaryExists` 用 sync `GlossaryFs`，pack loaders 用 async
   `FileSystem`。T2 不用不安全的 `as GlossaryFs` cast，而是 async 读 flat + 仅缺失时 seed（design 详述）。
2. **pack glossary 格式不是 markdown bullets**：T2 测试 fixture 初版用了 `- **Term**: def`（flat 格式），
   但 pack glossary 用 YAML frontmatter `terms:` 列表。修正 fixture 后绿。flat 与 pack 是两种不同格式，
   恰好印证为何需要 merge 桥接。
3. **skill-function-sync 双向**：registry 声明的 phase 必须在 SKILL.md 或 function-contracts.md 有引用。
   `mergeGlossaries` 是 `loadEnforcementGlossary` 的内部 helper（非 agent 直接调用），不入 registry；
   `loadEnforcementGlossary` registry 范围限定到真有引用的 5 phase（spec/decide/plan/grill/learn）。
4. **enforcement 语义变化（接受的 false-positive 风险）**：pack 术语进 enforcement 后，用 pack 定义的
   术语的冲突用法现在会被标记（之前不会）。这是 slice B REQ-6 明确推迟的原因，本切片承受该变化以闭合
   advisory/enforcement 割裂。block policy 不变（plan/review/build 不阻断）。

## Out of Scope

- 迁移 flat glossary.md 到分层模型（flat 保持主权）。
- 高频 pack 术语自动晋升到 flat（未来 /forge learn 增强）。
- context/state-machine enforcement（本切片仅 glossary；contexts/state-machines 仍 advisory）。
- 其余 7 个 PMS bounded-context 参照码。
