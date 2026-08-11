## Overview

一个只读聚合器：扫描 `.forge/` 目录，统计纪律执行率，产出静态 Markdown 仪表盘。数据全在，工程量集中在"口径定义"与"聚合脚本"。

## Architecture

### 数据源盘点（已验证存在）

| KPI | 数据源 | 聚合方式 |
|-----|--------|----------|
| spec→ship 完整链路率 | `.forge/specs/*/tasks.md` + git log | 统计同时有 locked spec + ship 痕迹的 feature 数 / 总 feature 数 |
| 三层评审拦截数 | `.forge/findings/*` + `.forge/specs/*/` review 记录 | 按 `[layer][severity]` 解析（复用 `guarded-merger.ts` 的 `parseReviewFindings` 格式）计数 P0/P1/P2 |
| replay 证据链占比 | `.forge/episodes/` 或 replay 痕迹 | 统计有证据链的 episode / 总 episode |

### 复用现有解析逻辑

`src/guarded-merger.ts:272` 的 `parseReviewFindings` 已能解析 `[layer][severity] file: issue` 格式——评审拦截数的聚合可直接复用此解析器，避免重写。

`src/episode.ts` 的 `schema_version: 1|2` 解析已能区分 legacy/structured episode，replay 占比统计复用它。

### 脚本结构

```
scripts/build-dogfooding-dashboard.mjs
  ├─ scanSpecs()          → 统计 feature 完整链路率
  ├─ scanFindings()       → 统计评审拦截数（复用 parseReviewFindings）
  ├─ scanEpisodes()       → 统计 replay 证据链占比
  ├─ renderMarkdown()     → 产出 .forge/dashboards/dogfooding.md
  └─ main()               → 编排 + 写文件
```

## Component Interfaces

CLI（user-facing，遵循 AGENTS §2.8 先 `--help`）：

```bash
node scripts/build-dogfooding-dashboard.mjs [--output <path>] [--since <date>]
```

无对外 TS API——纯脚本，产出 Markdown 文件。

## Data Model

仪表盘产物结构：

```markdown
# Forge Dogfooding 仪表盘
> 生成于 <ISO> · 数据范围 <since>..<until> · 口径见各 KPI 脚注

## 纪律执行率
| KPI | 数值 | 口径 |
|-----|------|------|
| spec→ship 完整链路率 | 42% | 有 locked spec 且 ship 的 feature / 总 feature |
| replay 证据链占比 | 67% | 有证据链的 episode / 总 episode |

## 评审拦截
| 级别 | 数量 | 抽样源 |
|------|------|--------|
| P0 | 3 | .forge/findings/audit-remediate-p0p1.md |
| P1 | 11 | ... |
| P2 | 27 | ... |
```

## Error Handling

- `.forge/` 目录缺失 → 提示"非 Forge 项目"并退出码 1
- 某子目录为空 → 该 KPI 显示"无数据（目录为空）"，不阻断其他 KPI
- 文件解析失败 → 跳过并在仪表盘"解析告警"区列出，不崩溃

## Testing Strategy

| 层级 | 测试 | 目标 |
|------|------|------|
| 单元 | 聚合纯函数（scanSpecs/scanFindings/scanEpisodes） | 给定 fixture 目录，输出正确计数 |
| 契约 | 确定性测试 | 同一 fixture 两次生成字节一致 |
| 韧性 | 缺数据测试 | 空目录/缺子目录不崩溃，显示"无数据" |

测试 fixture 用一个最小化的 `.forge/` 影子目录（`test/__fixtures__/dogfooding-sample/`），不依赖真实仓库数据。

## Rollout

1. 先实现聚合纯函数 + 单元测试（用 fixture）
2. 实现 renderMarkdown + 确定性测试
3. 在真实仓库跑一次，人工核对数字合理性
4. 决定产物是否纳入 git（倾向 gitignore，避免每次 commit 噪音）

## Current State (brownfield)

| Module | Path | Current Behavior |
|--------|------|------------------|
| specs 目录 | `.forge/specs/*/` | 170+ spec 目录，含 tasks.md / design.md |
| findings | `.forge/findings/*` | review 发现记录，`[layer][severity]` 格式 |
| episodes | `.forge/episodes/` | schema_version 1\|2 已可解析 |
| 现有解析器 | `src/guarded-merger.ts:272` `parseReviewFindings` | 可直接复用解析评审格式 |

## Proposed Change

**要改变的**：新增一个只读聚合脚本，把分散在 `.forge/` 的运行痕迹汇总成一份可信度仪表盘。

**明确不改变的**：
- `.forge/` 下任何现有文件的内容与格式
- 不新增任何埋点 / hook / 运行时采集

## Reversibility

**Rollback Checklist**：
- 删除 `scripts/build-dogfooding-dashboard.mjs`
- 删除 `test/*dogfooding*` 测试与 fixture
- 删除生成的 `.forge/dashboards/`

**Mount Points**：纯新增脚本，零 mount point。若产物纳入 gitignore 则需加一行 `.forge/dashboards/`。

## Open Questions

1. 产物是否纳入 git？倾向 gitignore（每次 commit 会变），但若要对外展示可信度又需要历史——可能折中为"手动 commit 关键里程碑快照"。
2. spec→ship 完整链路率的"ship 痕迹"如何判定？目前无显式 ship 标记，可能要用 git tag / CHANGELOG 交叉验证。需在 T-01 调研。
3. 是否纳入 `/forge learn` 输出？后续可考虑，本特性先独立产出。
