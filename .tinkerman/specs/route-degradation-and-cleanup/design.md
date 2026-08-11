---
spec: route-degradation-and-cleanup
status: pending
---

# Design — 依赖链 + 触发矩阵

## 核心依赖链（决定执行顺序）

```
17 类元维护脚本  ←  校验它们守护的体系  ←  各刀（先砍体系，脚本自然失效，再清理）
```

**不可先删脚本**——它们校验的体系（router / skill / docs / agent）还在，先删会让 Forge 自身 CI 失效（ci-script-audit 明确标"随减法失效，不立即动"）。必须先砍体系，脚本失业，再清理。

## 路由退化设计（首刀）

**现状**：三级档位 = 命令序列硬编排（模型必须按序走 build→review 等），AGENTS.md §1 以"不可跳步"强制。

**目标**：RouteHint 建议（可覆盖） + 不可跳铁律（强制）。

**实现路径**（ADR-0006 已铺好的路基）：
- ADR-0006 明确"extend RouteHint instead of mode system"——路由用 RouteHint 信号，不引入 mode
- 退化 = RouteHint 承载「档位建议」（Light/Standard/Full → 建议强度），命令序列从"必须"降为"推荐路径"
- 铁律（TDD/Verification/Three-Strike/Review/P0P1）保留为**硬阻断**，独立于档位

**AGENTS.md §1 改写**：
- 档位表：保留，但标注"建议"（用户覆盖优先 §路由原则 第1条已说）
- "不可跳步" → 改为"铁律不可跳"（列具体铁律），档位步骤可被 RouteHint / 用户覆盖
- §2.7（No Confirmation Between Steps）保留（它是铁律）

## 触发矩阵（刀 → 失效脚本 → 清理动作）

| 刀 | 失效脚本 | 清理动作 |
|----|----------|----------|
| **刀1 路由退化** | check-router-no-anti-noise / no-new-types / zero-regression (3) | git rm + 从 package.json check 链摘除 + router 测试更新 |
| **刀2 命令收敛**（38→几条铁律） | check-dispatcher-skeleton / check-registry-parity (2) | git rm + check 链摘除 |
| **刀3 agents 收缩**（27→评审为主） | check-agent-links / check-agent-originality / lint-agents (3) | git rm + check 链摘除 |
| **刀4 skill 简化** | validate-skill-length / descriptions / skeleton (×.mjs+.sh) / check-skill-function-refs (4) | git rm + check 链摘除 + check:strict 重定义 |
| **刀5 docs 瘦身** | check-docs-quota / root-whitelist / staleness / updated / index / structure (6) | git rm + docs:check 链摘除 |

## 验证（每刀）
- 砍体系：相关功能测试仍过（铁律不弱化）
- 清理脚本：`git grep` 无残留 + package.json/docs:check 链摘除 + `npm run check` 全绿
- 累计：每刀后跑全量 `npm run check`

## 风险
| 风险 | 缓解 |
|------|------|
| 路由退化放松过头，铁律被误覆盖 | 铁律独立硬阻断测试守；AGENTS.md 明列"不可跳"清单 |
| 清理脚本时漏摘 check 链 | grep + npm run check 验证 |
| 刀间累积回归 | 每刀独立分支 + commit + 全量验证 |
