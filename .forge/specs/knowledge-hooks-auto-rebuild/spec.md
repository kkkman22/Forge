---
status: draft
created: "2026-05-14"
topic: knowledge-hooks-auto-rebuild
---

# Spec: Knowledge Integrity / Catalog 自动 Hook

## 概述

`src/knowledge-integrity.ts` 和 `src/knowledge-catalog.ts` 已经是成熟的纯函数库，但当前**只在 `/forge learn` 阶段调用**。本 spec 把这两个能力作为事件驱动的自动 hook，在 ADR 写入 / solutions 文件变更 / episode 累积达阈值时自动触发，确保 `.forge/knowledge/catalog.md` 始终新鲜，每次 plan/build/decide 启动时研究阶段（Step 1 Research）的命中率最大化。

`src/knowledge-integrity.ts` 和 `src/knowledge-catalog.ts` 接口零修改。

## 动机

当前知识库刷新依赖**人工**触发（`/forge learn`）：

| 事件 | 当前行为 | 后果 |
|------|----------|------|
| forge-decide 写 ADR-NNNN | catalog 不会立即更新 | 紧接的 plan/build 看到的是旧 catalog |
| forge-learn 写入 `solutions/<topic>.md` | 不立即跑 integrity lint | broken-reference 累积，下次 learn 才发现 |
| episode 数 % 5 累积 | 不重建 instincts 索引 | 高频模式延迟提升为 instinct |
| skill 启动读 catalog.md | 不检查时间戳 | 可能命中过期信息 |

具体场景：

```
用户: /forge decide → 写 ADR-0042
       立即: /forge spec → /forge plan
       plan Step 1 Research 读 catalog.md
       但 catalog.md 还是 ADR-0042 之前的版本
       AI 错过刚刚的决策 → plan 与 ADR 不对齐
```

后果：决策与执行之间出现"空窗期"，需要用户手动跑 `/forge learn` 才能闭合。多数用户不知道或忘记。

## 核心设计原则

- **零修改 integrity / catalog 库**：纯函数已成熟，仅做调度普及
- **Event-driven 不是 time-based**：触发条件基于文件写入事件 / episode 计数事件，不基于 TTL
- **节流防止 thrashing**：同一类事件在短时间窗口内只触发一次（如 5 个 ADR 同一秒写入只重建一次）
- **autonomous 模式 fire-and-forget**：rebuild 是 IO 密集但非阻塞，写完即继续，不等待结果
- **失败降级**：rebuild / lint 失败仅 console.warn，绝不阻塞主流程
- **缓存基于内容 hash**：不是基于时间戳；catalog 输入文件的 mtime/hash 变化才触发重算

## 触发点矩阵

| 事件 | Hook | 触发条件 | 行为 |
|------|------|----------|------|
| `decide.ts` 写 ADR-NNNN-*.md | catalog rebuild | 写入完成且 hash 变化 | 重建 `.forge/knowledge/catalog.md` |
| `learn.ts` 写 solutions/*.md | integrity lint | 写入完成 | 跑 `lintKnowledgeIntegrity`，结果写 `.forge/findings/integrity-<topic>.md` |
| `learn.ts` 写 instincts.md / known-failures.md | catalog rebuild | 同上 | 同上 |
| Episode 数累积达 5 / 10 / 25 等阈值 | instincts 索引重建 | 阈值跨越 | 调用 `buildPatternUpgradeDrafts`，候选写 advisory |
| 任意 skill 启动读 catalog.md | mtime/hash 检查 | 输入文件比 catalog 新 | 后台触发 rebuild（不等待） |
| `glossary.ts` 写入（mergeTerm / archiveTerm） | catalog rebuild | 任何修改 | 同上（catalog 含术语数量） |

## 调度层契约

```ts
// src/knowledge-hooks.ts （新增）

export type KnowledgeEvent =
  | { kind: "adr_written"; path: string }
  | { kind: "solution_written"; topic: string; path: string }
  | { kind: "instincts_written"; path: string }
  | { kind: "known_failures_written"; path: string }
  | { kind: "glossary_written"; path: string }
  | { kind: "episode_threshold_crossed"; threshold: number; count: number }
  | { kind: "catalog_read"; readerSkill: string }

export type KnowledgeHookResult =
  | { kind: "rebuilt"; affectedFiles: string[]; durationMs: number }
  | { kind: "linted"; findings: IntegrityFinding[] }
  | { kind: "instincts_proposals"; proposals: PatternUpgradeDraft[] }
  | { kind: "skipped"; reason: "throttled" | "no_change_detected" | "cache_fresh" }

export interface KnowledgeHookInput {
  event: KnowledgeEvent
  forgeRoot: string
  /** 节流窗口内已触发的事件 hash 集合 */
  recentHashes: Set<string>
  now: Date
}

/** 调度入口：根据 event 决定调用哪个底层库。 */
export function dispatchKnowledgeEvent(input: KnowledgeHookInput): Promise<KnowledgeHookResult>

/** 节流判定：同一 event hash 在 throttleMs 内重复 → skip */
export function isThrottled(event: KnowledgeEvent, recentHashes: Set<string>, throttleMs: number): boolean

/** 计算 event hash 用于节流去重 */
export function hashEvent(event: KnowledgeEvent): string

/** Catalog 新鲜度检查：input files 的 mtime/hash 是否比 catalog 新 */
export function isCatalogStale(catalogMtime: number, inputFilesMtimes: number[]): boolean
```

## 节流策略

- **同步事件节流**：5 秒窗口内同一 event hash 只触发 1 次
- **批量写入合并**：连续写入多个 ADR / solutions 时，节流窗口内只重建 1 次 catalog
- **后台任务串行**：catalog rebuild + integrity lint 串行执行，避免文件竞争
- **会话级 hash 集合**：`recentHashes` 不跨 session 持久化（避免 resume 误判）

## 双模式行为

### Autonomous 模式

| 事件 | 行为 |
|------|------|
| ADR 写入 | fire-and-forget rebuild，主流程继续 |
| solution 写入 | fire-and-forget integrity lint；finding 写 advisory 文件，learn 阶段消费 |
| Episode 阈值 | fire-and-forget pattern upgrade proposals；写入 `.forge/findings/instincts-proposals-<date>.md` |
| catalog 读取且过期 | 背景 rebuild，本次 read 仍用旧版（避免阻塞读者） |

### Interactive 模式

| 事件 | 行为 |
|------|------|
| ADR 写入 | 同 autonomous（rebuild 静默执行） |
| solution 写入 + integrity finding | 输出中文摘要："知识库 integrity lint 发现 N 个 finding，详见 `<path>`" |
| Episode 阈值 + 高置信度 instinct 候选 | 询问用户是否提升为 instinct |
| catalog 读取且过期 | 同步 rebuild（用户在等读取，不应给旧版） |

## Episode 阈值定义

明确的阈值数列：

```
threshold_milestones = [5, 10, 25, 50, 100, 250]
```

每跨越一个 milestone 触发一次 `instincts_proposals` 事件。

判定函数：

```ts
function shouldTriggerEpisodeThreshold(currentCount: number, previousCount: number): number | null {
  for (const ms of threshold_milestones) {
    if (previousCount < ms && currentCount >= ms) return ms
  }
  return null
}
```

## Catalog 新鲜度判定

```ts
function isCatalogStale(catalogMtime: number, inputFilesMtimes: number[]): boolean {
  const maxInputMtime = Math.max(...inputFilesMtimes, 0)
  return maxInputMtime > catalogMtime
}
```

输入文件清单（用于 mtime 比较）：
- `.forge/knowledge/instincts.md`
- `.forge/knowledge/known-failures.md`
- `.forge/knowledge/evolved-rules.md`
- `.forge/knowledge/solutions/*.md`
- `.forge/decisions/ADR-*.md`
- `.forge/glossary.md`

## 接入点矩阵

| Skill / 模块 | 接入点 | event |
|--------------|--------|-------|
| forge-decide | ADR finalization 后 | `adr_written` |
| forge-learn | solution / instincts / known-failures / glossary 写入路径 | `solution_written` / `instincts_written` / etc. |
| forge-debug | Phase 4 完成后写 solutions/ | `solution_written` |
| Episode 写入路径（failure-sink driver） | episode 写入完成时 | `episode_threshold_crossed`（如跨越） |
| 任意 skill | 启动读 catalog.md 时 | `catalog_read` |

## 文件影响

### 新增

- `src/knowledge-hooks.ts` — 调度层（约 250 LoC）
- `test/knowledge-hooks.test.ts` — 单元测试覆盖所有 event kinds
- `test/knowledge-hooks.property.test.ts` — PBT：节流幂等性、阈值跨越判定、catalog stale 判定单调性
- `test/knowledge-hooks-skill-integration.test.ts` — 接入点契约测试

### 修改

- `src/index.ts` — barrel 导出 `knowledge-hooks.ts`
- `src/decide.ts` — `finalizeAdr` 完成路径 emit `adr_written` 事件
- `src/learn.ts` — solutions / instincts / known-failures / glossary 写入路径 emit 对应事件
- `src/debug.ts` — Phase 4 写 solutions 完成 emit 事件
- `src/episode.ts` 或 episode 写入 driver — 写入完成 emit `episode_threshold_crossed`（如跨越）
- `skills/forge-decide/SKILL.md` — ADR 章节标注"自动 catalog rebuild"
- `skills/forge-learn/SKILL.md` — 文件写入章节标注"自动 integrity lint"
- `skills/forge-debug/SKILL.md` — Phase 4 标注同上
- `skills/forge-plan/SKILL.md` — Step 1 Research 章节增加"catalog 新鲜度自动检查"

### 不变

- `src/knowledge-integrity.ts` 接口零修改
- `src/knowledge-catalog.ts` 接口零修改
- `.forge/knowledge/catalog.md` 输出格式不变
- `lintKnowledgeIntegrity` / `buildCatalog` / `renderCatalog` 函数签名不变

## 边界与约束

- **不替代 `/forge learn` 的批量维护**：learn 阶段仍是知识库的"主动维护"窗口；hook 只负责"被动同步"
- **不修改知识文档内容**：hook 只重建索引（catalog）+ lint，不动 solutions / instincts 内容
- **不阻塞主流程**：所有 hook 在 autonomous 都 fire-and-forget；写失败仅 warn
- **不跨 worktree 共享**：每个 worktree 维护自己的 `recentHashes`；worktree 合并到主仓库时由 conflict-resolver-hook 处理 catalog.md 冲突
- **节流不持久化**：会话结束 `recentHashes` 清零

## 风险与缓解（反模式对照）

| 反模式 | 是否风险 | 缓解 |
|--------|----------|------|
| 过度抽象 | 否 | 只做调度，不重新发明 lint/catalog 逻辑 |
| 触发链过长 | 否 | 单跳事件驱动，无嵌套触发 |
| 状态管理复杂度 | 中 | `recentHashes` 是新增会话级状态，但仅用于节流，不影响其他 hook |
| autonomous 硬阻塞 | 否 | 所有 rebuild fire-and-forget，绝不等待 |
| 时间型缓存 | 否 | 用 mtime/hash 比较，不用 TTL |

## 验收标准

1. `/forge decide` 写 ADR-0042 → catalog.md 在 5 秒内自动包含 ADR-0042
2. `/forge learn` 写 `solutions/auth.md` → integrity lint 自动运行，发现 broken-reference 写到 `findings/integrity-auth.md`
3. Episode 数从 4 增到 5 → emit `episode_threshold_crossed`，写 `findings/instincts-proposals-<date>.md`
4. 同一秒内连续写 3 个 ADR → 节流后只触发 1 次 catalog rebuild
5. `/forge plan` 启动读 catalog.md，但 catalog 比 instincts.md 旧 → 后台 rebuild 触发，本次 plan 仍读旧版（不阻塞）
6. autonomous 模式 catalog rebuild 失败（如目录不存在）→ console.warn，主流程继续
7. interactive 模式 instincts 候选生成 → 询问用户是否提升
8. 节流窗口内重复事件返回 `kind: "skipped", reason: "throttled"`
9. catalog 与 input files mtime 一致 → 返回 `kind: "skipped", reason: "cache_fresh"`
10. integrity lint 发现 contradiction → 写 advisory，不自动解决（保持现有 advisory 性质）

## 实施顺序

1. **调度层骨架**：实现 `src/knowledge-hooks.ts` + 节流逻辑 + 单元测试 + PBT
2. **ADR 写入接入**：`decide.ts` finalizeAdr 后 emit 事件，验证 catalog 自动 rebuild
3. **Solutions 写入接入**：`learn.ts` / `debug.ts` 接入 integrity lint
4. **Episode 阈值接入**：episode 写入路径 emit `episode_threshold_crossed`
5. **Catalog read 接入**：任意 skill 启动读 catalog 时检查新鲜度，过期触发后台 rebuild
6. **节流测试**：验证连续事件不会触发 thrashing
7. **文档对齐**：4 个 SKILL.md 同步更新

## 与其他 spec 的协同

| 相关 spec | 协同 |
|-----------|------|
| `failure-sink-trigger-expansion` | episode 写入是 failure-sink 的副作用，本 spec 在 episode 写入完成后接入 `episode_threshold_crossed` |
| `spec-health-hook` | 都是"健康度"类 hook：spec-health 检查 spec 文档健康；本 spec 检查知识库健康 |
| `glossary-consistency-hook` | glossary 写入触发本 spec 的 `glossary_written` 事件 → catalog rebuild |
| `conflict-resolver-hook` | worktree 合并时如 catalog.md 冲突走 conflict-resolver |
