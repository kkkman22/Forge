---
spec: route-degradation-and-cleanup
status: pending
---

# Tasks — 5 刀（刀1 详，刀2-5 占位）

## 刀 1：路由退化（`feature/route-degradation`）— 详
- [ ] `src/router` + `src/router-intents`：RouteHint 承载档位建议（Light/Standard/Full → 建议强度信号）
- [ ] 命令序列硬编排 → 推荐路径（RouteHint / 用户可覆盖）
- [ ] 铁律保持硬阻断（TDD / Verification / Three-Strike / Review 分离 / P0P1）—— 独立于档位
- [ ] `AGENTS.md` §1 重写：档位 → 建议（标注可覆盖）；新增"不可跳铁律"小节列强制项
- [ ] `test/router*`：更新断言（建议 vs 硬编排）
- [ ] 验证：铁律测试全过 + RouteHint 覆盖测试 + `npm run check`
- [ ] commit
- [ ] **触发清理**：`git rm scripts/check-router-{no-anti-noise,no-new-types,zero-regression}.mjs` + 从 `package.json` check 链摘除 + router 测试更新 + 验证 + commit

## 刀 2：命令收敛（独立 spec，占位）
- 38 子命令 → 几条不可跳铁律命令（/forge build/review/ship 等核心保留，流程编排类砍）
- 决策点：哪些命令是"铁律载体"（留）vs"流程编排"（砍）
- 触发清理：`check-dispatcher-skeleton` + `check-registry-parity` + 从 check 链摘除

## 刀 3：agents 收缩（独立 spec，占位）
- 27 agents → 评审 subagent 为主（spec-check/quality-check/security-check）+ 少量必要角色
- 决策点：每个 agent 是"评审分离载体"（留）vs"流程角色"（砍）
- 触发清理：`check-agent-links` / `check-agent-originality` / `lint-agents` + 摘除

## 刀 4：skill 简化（独立 spec，占位）
- skill 体系评估：哪些 skill 是"外部刹车/评审"载体 vs"流程编排"
- 触发清理：`validate-skill-{length,descriptions,skeleton}` (×.mjs+.sh) + `check-skill-function-refs` + `check:strict` 重定义

## 刀 5：docs 瘦身（独立 spec，占位）
- docs 治理体系评估：quota/whitelist/staleness 等是否仍必要（随 docs 量减少）
- 触发清理：`check-docs-{quota,root-whitelist,staleness,updated,index,structure}` + `docs:check` 链瘦身

## 收尾（所有刀完成后）
- [ ] package.json `check` 链最终瘦身（保 ~8 核心项，见 ci-script-audit-2026-08-11.md）
- [ ] `.forge/knowledge/evolved-rules.md`：移除已失效脚本引用的规则（如 R12 模式）
- [ ] 全量 `npm run check` + 两份审计的"随减法失效"项清零确认
