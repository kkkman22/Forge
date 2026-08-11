---
status: locked
feature: context-explosion-defense
layout: design
created: 2026-05-30
---

# Context Explosion Defense — 设计文档

## 概述

通过五层防御体系解决 Forge 的上下文爆炸问题。核心思路从"压缩单次输出"转向"减少重复输入 + 阶段隔离"，将单阶段 context 从 ~280 KB 降至 ~60 KB。

## 术语

- **Read Budget**：session 级 Read 累积 token 上限
- **Read Cache**：基于 git hash 的文件读取去重索引
- **Phase Boundary**：阶段间上下文隔离点
- **File-Based Return**：subagent 结果写入文件而非内联返回
- **Cumulative Read Tracker**：PostToolUse hook 维护的 Read 预算追踪

## 根因分析

### 为什么现有优化不够

```
PID 10793 实证（中小需求，75% context 使用率）：

  Read:  29 次调用 = 214 KB  ← 根因 #1：无去重，review.ts 读 10 次
  Bash:  51 次调用 = 66 KB   ← 根因 #2：未统一使用 forge_exec
  Agent: 21 个定义 = 75 KB   ← 根因 #3：全量加载不区分阶段
  Skill: 31 KB               ← 已压缩，继续优化 ROI 低
```

**根因 #1（Read 累积）** 是唯一量级最大的问题。单次 Read 优化无法解决累积效应。

### 上下文生命周期分析

```
全量路径上下文累积（decide → ... → ship）：

Session 1: decide
  Read: spec + codebase files → ~50 KB
  Bash: grep/find explorations → ~20 KB
  Agent: 5 decide agents → ~15 KB
  小计: ~85 KB（OK）

Session 1 continued: spec
  Read: decide 产物 + requirements → +40 KB = 125 KB
  Bash: validation → +10 KB = 135 KB
  ⚠️ 已超过 60% 阈值

Session 1 continued: plan
  Read: spec 全文 + progress + codebase → +60 KB = 195 KB
  Bash: analysis → +15 KB = 210 KB
  ⚠️ 已超过 80% 阈值

Session 1 continued: build  ← 这里崩溃
  Read: plan + progress + 源码(×10) + 测试 → +100 KB = 310 KB
  💥 上下文溢出
```

**设计洞察**：必须在不同阶段之间强制清除上下文，而非在同一 session 内堆积。

## 架构设计

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Session                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ System Prompt │  │ forge-context MCP │  │ SKILL Rules   │  │
│  │ - CLAUDE.md   │  │ - forge_exec      │  │ - Dedup Law   │  │
│  │ - rules/      │  │ - forge_git       │  │ - Budget Gate │  │
│  │ - agents/     │  │ - forge_read_     │  │ - Phase       │  │
│  │   (filtered)  │  │   cached (NEW)    │  │   Boundary    │  │
│  └──────────────┘  └──────────────────┘  └───────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Context Budget Tracker               │    │
│  │  PostToolUse Hook (Read) → track-read-budget.mjs     │    │
│  │  累积: 87KB / 150KB                                   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────── Phase Boundary Gate ───────────────────┐    │
│  │  >60%: ⚠️ 建议 /clear + /forge resume               │    │
│  │  >80%: ⛔ 必须 /clear + /forge resume                │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

Session 间状态桥接：
  .tinkerman/progress/<topic>.md  — 任务状态
  .tinkerman/plans/<topic>.md     — 计划（最小化读取）
  .tinkerman/reviews/<layer>.md   — 评审结果（文件化返回）
  .tinkerman/status.md            — 当前阶段 + 分支
```

### 五层防御体系

```
Layer 1: Read 去重缓存 ─────────── 消除重复读取（-40% Read）
  forge_read_cached MCP tool + Dedup Iron Law

Layer 2: 阶段隔离 ──────────────── 消除跨阶段累积（-50% 总累积）
  Phase Boundary Gate + /clear + /forge resume

Layer 3: Subagent 文件化返回 ────── 减少 agent 结果占用（-80% agent 返回）
  Write to .tinkerman/reviews/ + 800 char 摘要返回

Layer 4: Resume 上下文最小化 ────── 减少恢复时的加载量
  按阶段的最小加载清单

Layer 5: Read 预算监控 ──────────── 运行时防护
  PostToolUse hook + 阈值预警
```

## 详细设计

### Layer 1: forge_read_cached MCP Tool

#### 数据结构

```typescript
// 缓存索引
interface ReadCacheIndex {
  entries: Record<string, CacheEntry>;
}

interface CacheEntry {
  path: string;
  gitHash: string;        // git blob hash 或 SHA-256（untracked）
  lineRange?: [number, number];
  contentHash: string;    // SHA-256 of read content
  timestamp: number;
  charCount: number;
}
```

#### 状态机

```
forge_read_cached(path, start_line?, end_line?)

  ┌─────────────────┐
  │ 查找缓存索引     │
  └────────┬────────┘
           │
     ┌─────▼──────┐     未找到      ┌──────────────────┐
     │ 缓存命中？  │───────────────→│ 全量读取          │
     └─────┬──────┘                │ 更新索引          │
           │ 命中                   │ 返回完整内容      │
     ┌─────▼──────────┐            └──────────────────┘
     │ 比较 git hash   │
     └─────┬──────────┘
           │
     ┌─────▼──────────┐     hash 相同    ┌───────────────────┐
     │ hash 变化？     │───────────────→ │ 返回 cached 消息   │
     └─────┬──────────┘                 │ "unchanged since   │
           │ hash 不同                    │  last read (N chars)"
     ┌─────▼──────────┐                 └───────────────────┘
     │ 计算 diff       │
     │ 更新索引        │
     │ 返回 diff 部分  │
     └────────────────┘
```

#### 缓存存储

- 文件路径：`${TMPDIR}/forge-read-cache-<sessionId>.json`
- Session 结束自动清理（TMPDIR 生命周期）
- 不被 git 追踪

#### Session ID 获取

从 Claude Code 环境变量 `CLAUDE_SESSION_ID` 或 fallback 到 PID。

### Layer 2: Phase Boundary Gate

#### 上下文使用率检测

Claude Code 目前不直接暴露 context 使用率给 hooks。方案：

**方案 A（推荐）：Read 预算近似**
- 通过 Layer 5 的 PostToolUse hook 累计 Read + Bash 输出
- 阈值：100 KB = 60% 等效，150 KB = 80% 等效
- 不依赖 Claude Code 内部 API

**方案 B（备选）：Restatement Checkpoint 复用**
- 在 build 的 Restatement Checkpoint（每 N 个 task）时评估
- 由主 agent 心算评估当前上下文"感觉"
- 低精度但零实现成本

#### Phase Advance 流程

```
task 完成 → 更新 progress → 检查 Read budget

  budget < 100 KB → 继续下一 task
  budget 100-150 KB → 输出警告，继续但建议 /clear
  budget > 150 KB → 输出强制建议，停止执行

phase 完成 → 写入 status.md → 必须评估 budget

  budget < 100 KB → 可在同一 session 继续
  budget > 100 KB → 建议 /clear + /forge resume
```

### Layer 3: Subagent 文件化返回

#### 修改前后对比

```
修改前：
  主 agent spawn spec-check → subagent 返回 3KB 报告 → 进入主 context
  主 agent spawn quality-check → subagent 返回 2KB 报告 → 累积 5KB
  主 agent spawn security-check → subagent 返回 1.6KB 报告 → 累积 6.6KB

修改后：
  主 agent spawn spec-check →
    subagent Write .tinkerman/reviews/spec-check-20260530-061500.md
    subagent 返回: "status:pass findings:3 p0:0 p1:0 report:.tinkerman/reviews/..."
  主 agent: 无 P0/P1 → 不读取完整报告 → 仅 200 chars 进入 context

  结果: 6.6 KB → ~0.6 KB（-91%）
```

#### Agent 定义变更模板

在 `spec-check.md`、`quality-check.md`、`security-check.md` 末尾追加：

```markdown
## 结果返回协议（MANDATORY）

你的最后一步必须：
1. Write 完整报告到 .tinkerman/reviews/<layer>-<timestamp>.md
2. 最终返回文本限制在 800 chars 以内，格式：

   status: <pass|fail>
   findings: <total_count>
   p0: <count> | p1: <count>
   report: .tinkerman/reviews/<path>

禁止在最终返回中包含完整报告内容。
```

#### 主 agent 处理逻辑

在 `/forge review` instructions.md 中：

```markdown
## Subagent 结果处理

收到 subagent 结果后：
1. 解析摘要（status / findings / p0 / p1 / report_path）
2. 如果 p0 > 0 或 p1 > 0 → Read report_path 获取完整详情
3. 如果 p0 = 0 且 p1 = 0 → 不读取，仅基于摘要生成综合结论
4. 综合评审报告仍然输出到 .tinkerman/reviews/<timestamp>-combined.md
```

### Layer 4: Resume 上下文最小化

#### 按阶段最小加载清单

| 阶段 | 必须加载 | 最大 token | 不加载 |
|------|----------|-----------|--------|
| build | plan（仅未完成 task） + progress + status + config | ~3K | spec 全文、decide 产物、已完成 task |
| review | spec（仅 AC 列表） + diff stat + progress + agent 定义 | ~5K | build 源码读取历史、测试输出 |
| test | progress + 测试文件路径列表 | ~2K | build 实现细节、review 全文 |
| ship | progress + review 摘要 + branch status | ~2K | 完整 review 报告、build 历史 |

#### inject-plan-context.mjs 增强

当前已限制为 `MAX_TOTAL_CHARS = 8000`（~2K tokens）。增强点：
- 增加 `--phase <phase>` 参数，按阶段过滤注入内容
- build 阶段只注入未完成 task（当前已实现 `isActive` 过滤）
- 增加 `--compact` 模式：只注入 task 标题，不注入描述

### Layer 5: Read 预算监控

#### Hook 实现

```javascript
// scripts/track-read-budget.mjs
// PostToolUse hook, matcher: Read

const BUDGET_FILE = `${process.env.TMPDIR}/forge-read-budget-${process.env.CLAUDE_SESSION_ID}.json`;

const WARN_THRESHOLD = 100 * 1024;   // 100 KB
const FORCE_THRESHOLD = 150 * 1024;  // 150 KB

// 读取工具返回结果的字符数
// 累加到预算文件
// 超阈值输出警告
```

#### 与 hooks.json 集成

```json
{
  "PostToolUse": [
    {
      "matcher": "Read",
      "hooks": [
        {
          "type": "command",
          "command": "node scripts/track-read-budget.mjs \"$TOOL_INPUT_FILE\" 2>/dev/null || true",
          "timeout": 2
        }
      ]
    }
  ]
}
```

#### 预算重置

Session start 时（SessionStart hook）自动重置预算计数器：
```json
{
  "SessionStart": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "rm -f ${TMPDIR}/forge-read-budget-*.json 2>/dev/null || true",
          "timeout": 1
        }
      ]
    }
  ]
}
```

## 与已有系统的关系

### 与 forge-context MCP 的关系

```
forge-context MCP (已有):
  forge_exec   → Bash 输出裁剪（保留）
  forge_git    → Git 查询摘要化（保留）
  forge_read   → 批量文件分析（保留）

新增:
  forge_read_cached → Read 去重缓存（新增到 forge-context）
```

`forge_read_cached` 是 `forge_read` 的补充，不是替代。两者解决不同场景：
- `forge_read`：批量文件分析，用脚本处理，只返回结论
- `forge_read_cached`：单文件读取，带缓存去重，减少重复进入 context

### 与 SKILL 文档的关系

需要更新的文件：
1. `skills/forge/lib/build/instructions.md` — 新增 Read Dedup Iron Law
2. `skills/forge/lib/build/references/context-budget.md` — 重写为五层防御体系
3. `skills/forge/lib/review/instructions.md` — subagent 结果处理逻辑
4. `skills/forge/lib/test/instructions.md` — Read Dedup Iron Law
5. `.claude/agents/spec-check.md` — 结果返回协议
6. `.claude/agents/quality-check.md` — 结果返回协议
7. `.claude/agents/security-check.md` — 结果返回协议

### 与 hooks.json 的关系

新增 hooks：
1. `PostToolUse[Read]` → `track-read-budget.mjs`
2. `SessionStart` → 预算重置

### 与 .tinkerman/ 文件系统的关系

新增产物：
1. `.tinkerman/reviews/<layer>-<timestamp>.md` — subagent 文件化返回
2. `${TMPDIR}/forge-read-cache-<session>.json` — Read 缓存索引（不进入 git）
3. `${TMPDIR}/forge-read-budget-<session>.json` — Read 预算追踪（不进入 git）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| forge_read_cached 不可用 | Read 去重失效 | Iron Law 规则兜底（手动控制 ≤2 次） |
| Claude Code 不暴露 context 使用率 | Layer 2 精度低 | 用 Read 预算近似 |
| Subagent 不遵循文件化返回协议 | 主 agent 无摘要 | 主 agent 有截断检测（已有 subagent-truncation-fix） |
| 过度隔离导致效率降低 | 用户需要多次 /clear | 仅在 budget > 阈值时触发 |
| TMPDIR 文件丢失 | 缓存和预算追踪丢失 | 降级为无缓存模式，功能不受影响 |
