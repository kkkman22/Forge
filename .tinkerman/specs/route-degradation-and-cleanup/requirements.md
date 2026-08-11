---
spec: route-degradation-and-cleanup
status: pending
basis: ADR-0009 (§砍#2 路由) + ADR-0011 (17 类随减法失效) + ADR-0006 (RouteHint)
created: 2026-08-11
owner: forge-maintainers
---

# Route Degradation + 17-class Cleanup — Requirements

## Goal
1. 三级路由硬档位（Light / Standard / Full 命令序列硬编排）退化为「RouteHint 建议 + 不可跳铁律」
2. 路由 / 命令 / agents / skill / docs 各刀落地后，清理自然失效的 **17 类元维护 CI 脚本**（ci-script-audit-2026-08-11.md 标"随减法失效"项）

## Requirements

### 路由退化（首刀，详）
1. Light / Standard / Full 的「命令序列硬编排」（`build→review` / `plan→build→review→test→ship` / `decide→...→learn`）退化为**建议**
2. 保留**不可跳铁律**（强制，不可覆盖）：
   - TDD（§2.1 RED→GREEN→REFACTOR）
   - Verification 铁律（§2.3 没运行验证 = 不能声明通过）
   - Three-Strike 熔断（§2.4）
   - Review 执行-评审分离（§3.1）
   - P0/P1 ship 阻断（§3.3）
3. RouteHint（ADR-0006 已有）扩展承载「档位建议」，模型 / 用户可覆盖
4. AGENTS.md §1 路由规则改写：档位 → 建议（可覆盖），铁律 → 强制（不可跳）

### 17 类清理（随各刀落地，触发式）
5. **router 元维护**（3）：`check-router-no-anti-noise` / `no-new-types` / `zero-regression` — 路由退化后失效 → 清理
6. **dispatcher / registry**（2）：`check-dispatcher-skeleton` / `check-registry-parity` — 命令收敛后失效
7. **agent 元维护**（3）：`check-agent-links` / `check-agent-originality` / `lint-agents` — agents 收缩后失效
8. **skill 元维护**（4）：`validate-skill-length` / `descriptions` / `skeleton` / `check-skill-function-refs` — skill 简化后失效
9. **docs 治理**（6）：`check-docs-quota` / `root-whitelist` / `staleness` / `updated` / `index` / `structure` — docs 瘦身后失效

## Constraints
- **铁律不可弱化**（ADR-0009 §保留 #1）——路由退化只放松"档位编排"，不放松铁律
- **行为不破坏**：铁律仍阻断，建议可被 RouteHint / 用户覆盖
- **每刀独立 spec**（本 spec 是伞 + 路由退化首刀详；刀 2-5 占位，各自开 spec）

## Out of scope
- 改名（`rename-to-tinkerman` spec）
- pass 1 已砍 20 脚本（commit d9caf7f3，完成）
- review P2 剩余项（#1 config.md 注释 / #2 set-active-plan 半残 / #5 evolved-rule）—— 各刀 spec 内处理或独立收尾 commit

## 依据
- ADR-0009 §砍 #2（三级路由硬档位退化为建议+铁律）
- ci-script-audit-2026-08-11.md「随减法失效」17 类
- ADR-0006（RouteHint 而非 mode system —— 退化的技术载体）
