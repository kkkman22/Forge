---
feature: audit-remediate-0619
layout: design
created: 2026-06-19
tier: full
work_nature: bugfix
---

# Design — Audit Remediate 0619

> 范围限定为 4 项低风险、可独立验证、不与现存 locked spec 冲突的 bugfix。
> 设计原则：最小改动、委托而非重写、保持对外行为（除明确 bug 修正）不变。

## 设计决策

### D1: REQ-01（workNature）—— 经核实为设计契约，非 bug（重新判定）
- 实现期核对 `workflow-graph.ts:232-269` 发现：`getRouterSequence` 返回 **routerPhases**，而同 tier 下 feature/refactor/bugfix 的 routerPhases **设计为相同**（light 均为 `['build','review']`）。workNature 的差异体现在 **schedulerPhases**，由 skill-scheduler 使用。
- 因此 router 用 `getRouterSequence(tier)` 不传 workNature 符合设计；scheduler 用 workNature 选 schedulerPhases 是其职责——两者是职责分离，非"一致性裂缝"。
- **决策**：不改动 `router.ts`；删除旧 property test 中编码误判的断言，新增固化"routerPhases workNature-agnostic"的契约测试。

### D2: REQ-02（RED gate）—— 用 `SUCCESS_INDICATORS.some(...)` 表达原意
- 原代码循环 + 硬编码 `/passed/i` 表达混乱，但 `SUCCESS_INDICATORS` 已含 `"passed"` —— 改为 `some` 后语义等价于"匹配任一成功模式"。
- **优先级语义**：保留"含 failure indicator 时不判 success"——failure indicator 检查在后，且 success 检查的 `!failed` 条件可去掉（由 failure 检查兜底）。但为最小改动，保留 `!failed` 作为 success 分支的额外护栏。
- 简化后逻辑：
  ```
  if SUCCESS_INDICATORS.some(ind => RegExp(ind, "i").test(output)) && !FAILURE_INDICATORS.some(...):
      return invalid  // RED test 实际通过了
  if !hasFailureIndicator: return invalid  // 无失败也无成功信号，证据不足
  return valid
  ```

### D3: REQ-03（require → import）—— 动态 import，保留外层 catch
- `event-writer.js` 是 ESM 模块，`require` 在运行时未定义。
- 包含函数若非 async，改为 async；调用方（migration 入口）需 await。
- 导入失败语义：外层 try/catch 已存在，保留其记录逻辑。

### D4: REQ-04（spec-bundle-io 委托）—— 函数级委托，保留导出名
- 不删除 spec-bundle-io.ts（其测试是真实 consumer，删除会丢测试覆盖语义）。
- 改造模式：`export function renderRequirementsMarkdown(doc) { return specRender.renderRequirementsMarkdown(doc); }`
- 若 spec-render 的函数签名/参数与 bundle-io 不完全一致，需在委托层做最小适配（而非重新实现逻辑）。
- **风险**：open questions 编号 bug、缺 enforceEarsSyntax 是 bundle-io 的"错误行为"，其测试可能依赖之——这些测试须改为验证 spec-render 的正确输出。

## 不做的事（明确排除）

- 不收敛 P2-H 双映射表（`getWorkNatureSequenceKey` 仍保留，本轮只修 router 调用方）。
- 不碰 accept-driver.ts / agentic-acceptance（locked spec）。
- 不删 PUA（架构决策未定）。
- 不清理退役 sandbox 模块。
- 不合并 parseFrontmatter / semver（code-slim-0612 已定非目标）。

## 测试策略

- 每个 REQ 先写 RED 测试（复现 bug），再 GREEN。
- 回归：`npx vitest run` 全套须绿。
- 类型：`npx tsc --noEmit` 须通过（特别是 require→import 改动易引入类型问题）。
- dist 同步：INV-4，改动后 `check-dist-sync.mjs` 须过。

## 回滚清单

- 每个 REQ 独立原子提交，可 `git revert` 单个。
- spec-bundle-io 委托改动若引发大面积测试失败，可 revert 后改为"标记 deprecated + 文档指引"降级方案。
