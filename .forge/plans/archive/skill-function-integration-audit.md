---
topic: "skill-function-integration-audit"
spec_ref: ".kiro/specs/skill-function-integration-audit"
status: "approved"
created: "2026-04-30"
---

# Plan: SKILL-纯函数对接审计

> 来源: `.kiro/specs/skill-function-integration-audit/tasks.md`

## Objective

审计并修复 SKILL 文档与纯函数模块之间的对接断裂。纯文档修改，不动 TypeScript 代码。

## 任务摘要

1. **审计报告** — 扫描 4 个模块的 exported 函数，对照 SKILL 文档，生成对接状态报告
2. **forge-build/SKILL.md** — 添加 8 个函数调用说明（门禁、三次换路、研究、5 个 Trimmer）
3. **forge-review/SKILL.md** — 添加 `serializeReviewSummary()` 调用说明
4. **forge-ship/SKILL.md** — 添加 `checkShipGate()` / `checkShipGateWithChecklist()` 调用说明
5. **forge-learn/SKILL.md** — 添加 6 个函数调用说明 + Budget Report 新步骤
6. **forge-decide/SKILL.md** — 添加 `serializeSubagentSummary()` 调用说明
7. **CONTRIBUTING.md** — 添加对接检查 checklist
8. **验证** — 重新审计确认所有 ❌/⚠️ 变为 ✅，运行 `npm run check`

## 依赖关系

```
Task 1 (审计) → Task 2/3/4/5/6 (并行) → Task 7 (CONTRIBUTING) → Task 8 (验证)
```

## 风险评估

- **极低风险**：纯文档修改，无代码变更，无回归风险
- **注意点**：每个函数调用说明必须包含三要素（函数名、参数来源、返回值用途）
