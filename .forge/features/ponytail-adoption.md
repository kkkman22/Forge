---
topic: ponytail-adoption
generated_at: 2026-06-18T00:00:00.000Z
auto_generated: true
stage_count: 3
total_files: 3
---

# Feature: ponytail-adoption

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [requirements.md](../specs/ponytail-adoption/requirements.md) | draft | 2026-06-18 |
| Plan | [design.md](../specs/ponytail-adoption/design.md) · [tasks.md](../specs/ponytail-adoption/tasks.md) | approved | 2026-06-18 |
| Build | in progress | — | 2026-06-18 |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Requirements** (draft, 2026-06-18)：借鉴 Ponytail（github.com/DietrichGebert/ponytail）的 YAGNI 阶梯理念，填补 Forge build 阶段"这事该不该做"的前置闸门空白。现有覆盖：rung 4（dependency-discipline.md）、rung 6（TDD GREEN）；差距：rung 1-3、5（YAGNI 跳过 / stdlib / 原生平台 / 一行优先）+ review Layer 2 缺"砍代码"维度 + 延迟决策无追踪标记。明确不借鉴 Ponytail 的测试最小化（违反 §2.1 TDD 铁律）、强度档位、prose 压缩（与 Caveman 正交）。
- **Design** (2026-06-18)：5 个设计决策——D1 YAGNI 闸门作 TDD 前置不替换 TDD、D2 rung 4/6 引用既有文档不复制、D3 Deletions 作 quality-check 独立维度 8 不并入 Deslop、D4 用 `forge:defer` 命名空间不沿用 `ponytail:`、D5 内化规则不推荐装 Ponytail plugin（测试观与 TDD 铁律冲突）。
- **Tasks** (2026-06-18)：4 Wave 8 Task。Wave1 forge-build YAGNI 闸门+硬边界（1.1 toml 闸门 / 1.2 Self-Review 硬边界+双副本）、Wave2 quality-check Deletions 维度 8（2.1）、Wave3 forge:defer 标记+learn 回收（3.1 标记说明+deferred.md / 3.2 learn 回收步骤）、Wave4 校验（4.1 npm run check）。无运行时代码改动，纯 agent 指令+文档。
