---
updated: 2026-08-11
---
# Plan Pre-flight Detection Rules

> 被 `src/build/plan-preflight.ts` 的 `runPlanPreflight` 实现，被 build/instructions.md §2 第 5 行调用（spec `plan-pre-flight-check`）。

## 内部冲突检测（R2）

| 规则 | 检测内容 | 判定证据 |
|------|---------|---------|
| R2.AC1 | 文件操作冲突 | 某 Task `Operation: DELETE` 的文件路径，出现在后续 Task 的 File 字段或 File Mapping |
| R2.AC2 | 依赖反向 | Task A Depends On 含 Task B，且 B Depends On 含 A（循环）；或 A 依赖编号 > 自己的 Task（顺序倒置）；或自依赖 |
| R2.AC3 | Spec Coverage 缺口 | Spec 某 Requirement 在 plan 的 Spec Coverage 表无 Covering Task（空 cell） |
| R2.AC4 | Verify 白名单违规 | Task Verify 字段以 `vitest`/`bash`/`forge_exec` 开头（像 verify-by 标签）但不在 `.forge/config.md` 的白名单 `[vitest:unit, vitest:component, bash:contract, forge_exec:e2e, manual]` 内。自由形式的命令（如 `npx vitest run test/x.ts`）不算违规 |
| R2.AC5 | 重复 Task 标题 | 两个 Task 标题字符串完全相同（导致 handoff/commit 引用歧义） |

## plan 自带违规检测（R3）

| 规则 | 关键词模式（非穷尽，宁少勿多） | 判定 |
|------|-----|------|
| R3.AC1 TDD 违规 | `先写实现.*再补测试` / `先实现.*后补.*测试` / `代码先行.*测试后补` / `实现优先.*测试后补` / `写实现.*补测试` | 命中即触发 |
| R3.AC2 跳过验证 | `跳过 verify` / `跳过验证` / `手动验证即可` / `测试以后再补` / `测试后续补` | 命中即触发 |
| R3.AC3 阶段间确认 | `询问用户是否继续` / `等用户确认再下一步` / `停下来等.*确认` / `完成后请.*确认` | 命中即触发 |
| R3.AC4 RED 缺失（full format） | Task body 有 GREEN 段但无 RED 段（启发式：正则匹配） | 命中即触发 |

## 误报处理（R4）

开发者确认某触发项为误报时，在 plan 对应 Task 下追加：

```
<!-- preflight-exempt: <规则编号> reason: <理由> -->
```

支持的规则编号：`R2.AC1` / `R2.AC2` / `R2.AC3` / `R2.AC4` / `R2.AC5` / `R3.AC1` / `R3.AC2` / `R3.AC3` / `R3.AC4`。

重 approve 后该规则对所有 Task 跳过。exempt 使用建议记录到 `.forge/progress/<topic>.md` 预检日志段，为后续关键词优化提供数据。

## Pass / Fail 语义

- **pass**：9 项规则全部执行，0 项触发（含豁免后）。build 输出 `✅ Plan Self-Consistency 通过（9 项检测，0 项触发）`。
- **fail**：至少 1 项触发。build 输出 Rejection（按 build/instructions.md §2 统一格式），一次列全所有 violations，每项含规则编号、涉及 Task、证据。路由回 `/tinkerman plan` 修订。
- **Light tier 跳过**：无 plan 文档时不执行预检（由 build SKILL 层判断）。
