---
name: token-layered-defense
status: draft
created: "2026-05-31"
updated: "2026-05-31"
tier: standard
---

# Design Document: Token 分层防御体系

## Overview

在 Forge 现有的 MCP 工作流基础设施之上，叠加 6 层 token 压缩防御。每层只处理自己那一段的消耗，不指望一个工具解决所有问题。

**核心架构原则**：

1. **工作流层不可替代**：`forge_exec`、`forge_read`、`forge_git` 是 Forge 的命令执行、代码探索、Git 集成基础设施，不是纯压缩器
2. **叠加而非替代**：新工具叠加在 Forge MCP 之上，不替换任何工作流工具
3. **Fallback Ladder**：每个新工具都有降级路径，不可用时自动回退

## 架构

```
用户的 Prompt
│
├── Layer 0: Forge 工作流基础设施（保留核心，增强压缩引擎）
│   ├── forge_exec    — 命令执行 + deny + Iron Law + RTK 压缩（默认）
│   ├── forge_read    — 批量分析 + FORGE_FILES 注入
│   ├── forge_git     — 结构化 Git 数据源（diff/status/log）
│   ├── context-budget.ts — 类型化序列化/反序列化协议
│   ├── inject-plan-context.mjs — 阶段感知 plan 注入
│   ├── phase isolation gates   — 阶段间上下文隔离
│   ├── compact restatement     — compact 后重注入关键信息
│   └── disallowedTools + frozen zone — 安全控制
│
├── Layer 1: CRG 代码图谱（新增，替代 forge_read_cached + Explorer batch）
│   └── code-review-graph MCP — AST 级知识图谱查询
│
├── Layer 2: bash-ban 门禁（新增，拦截 Bash 绕路）
│   └── PreToolUse hook — 封 cat/head/tail/grep 单文件读取
│
├── Layer 3: 全局压缩阈值（新增，替代 track-read-budget）
│   └── AUTOCOMPACT_PCT_OVERRIDE=60 — 60% 触发自动压缩
│
├── Layer 4: context-mode（默认安装，forge init Step 7）
│   └── 大输出沙箱 — 超大输出（>1000 行）沙箱执行，只返回摘要
│
├── Layer 5: Headroom + RTK（默认安装，forge init Step 7）
│   └── API 级全量压缩 — 请求离机前压缩整个 prompt
│
└── Layer 6: Caveman（默认安装，forge init Step 7）
    └── 回复压缩 — Claude 输出压成寄存器模式
```

## Components

### Layer 0: Forge 工作流基础设施（保留）

**保留核心工作流逻辑，增强压缩引擎。** `forge_exec` 的压缩后端从简单正则升级为 RTK，但命令执行、deny patterns、Iron Law 等工作流逻辑不变。

| 工具 | 工作流角色 | Token 优化角色 |
|------|-----------|---------------|
| `forge_exec` | 命令执行器 + deny patterns + 超时 | **RTK 压缩（默认）** → `trimCommandOutput`（fallback） |
| `forge_read` | 批量分析 + `FORGE_FILES` 注入 | 文件内容不进入上下文 |
| `forge_git` | 结构化 Git 数据源 | diff 智能截断（1500 行上限） |

**RTK 集成到 `forge_exec` 的方式**：

```
forge_exec 执行命令
  → exit ≠ 0 → 完整输出（Iron Law，永远不变，绕过 RTK）
  → exit = 0 → rtk compress stdout（RTK 可用时）
             → trimCommandOutput()（RTK 不可用时的 fallback）
```

**为什么 RTK 是默认而不是可选叠加**：
- `trimCommandOutput` 只做简单正则提取（`pass|fail|error|warn|coverage`），信息丢失严重
- RTK 做智能去噪（删样板、合并重复、智能截断），信息保留率高得多
- RTK < 10ms 开销，零网络依赖，对用户体验无感
- Iron Law 不受影响——RTK 只处理成功输出

**`forge_git` 不使用 RTK 的理由**：
- `forge_git` 输出结构化数据（`GitDiffSummary`、`GitStatusSummary`），主 agent 依赖 `context-budget.ts` 的反序列化做流程决策
- RTK 是通用文本压缩，会破坏结构化数据格式
- `forge_git` 已有专用截断策略（1500 行上限，100 行/文件，优先级排序），比 RTK 更适合

**涉及文件**：
- `src/mcp/tools/forge-exec.ts` — **修改**：集成 RTK 压缩引擎
- `src/mcp/trimmers/output.ts` — **修改**：标记为 fallback，新增 `trimWithFallback()` 函数
- `src/mcp/tools/forge-read.ts` — 保留
- `src/mcp/tools/forge-git.ts` — 保留
- `src/mcp/trimmers/git.ts` — 保留
- `src/context-budget.ts` — 保留
- `scripts/inject-plan-context.mjs` — 保留

### Layer 1: CRG 代码图谱（新增）

**替代**：`forge_read_cached`（MCP 缓存去重）+ Explorer "Think in Code" batch 脚本

**工具选型**：[code-review-graph](https://github.com/tirth8205/code-review-graph)

选 CRG 而非 CBM 的理由：
- 30 个 MCP 工具（CBM ~5 个）
- Blast-radius 分析（100% recall, 0.71 F1）
- 风险评分 + 架构概览 + 社区检测
- MIT 许可证，CI 完备，benchmark 可复现
- 一行安装：`pip install code-review-graph && code-review-graph install --platform claude-code`

**安装方式**：
```bash
pip install code-review-graph
code-review-graph install --platform claude-code
code-review-graph build
```

**Forge 集成点**：

| Forge 阶段 | CRG 工具 | 替代 |
|-----------|---------|------|
| `/forge plan` 代码探索 | `query_graph_tool`, `get_minimal_context_tool` | Explorer batch 脚本 |
| `/forge plan` Ripple 检查 | `get_impact_radius_tool` | 手动 grep 追踪 |
| `/forge review` | `detect_changes_tool`, `get_review_context_tool` | 逐文件 Read |
| `/forge learn` | `get_knowledge_gaps_tool` | 手动总结 |

**Fallback Ladder**：
```
CRG 可用？
├── YES → query_graph_tool（~100 tokens）
└── NO → Explorer "Think in Code" batch 脚本（~3K tokens）
```

**涉及文件**：
- `.claude/agents/explore.md` — 新增 CRG fallback 分支
- `scripts/check-companions.mjs` — 新增，检测 CRG 是否可用

### Layer 2: bash-ban 门禁（新增）

**PreToolUse hook**：拦截 Bash 中的裸文件读取命令。

**智能过滤逻辑**（不是简单的命令黑名单）：

```javascript
// scripts/bash-ban-raw.mjs — 核心逻辑伪代码
const command = extractCommand(input);
const isPiped = command.includes('|');
const isSingleFileRead = /^(cat|head|tail|less|more)\s+\S/.test(command);
const isSingleGrep = /^(grep|rg|ag)\s+[^|]*\s+\S/.test(command) && !isPiped;
const isUnlocked = exists('/tmp/bash-raw-unlock-' + process.ppid);

if (isUnlocked) return exit(0);  // 逃生门
if (isPiped) return exit(0);      // 管道组合 = 批量分析，放行
if (isSingleFileRead || isSingleGrep) {
  console.error('BLOCK: Use Read/Grep/Glob tools instead');
  return exit(2);  // 阻断
}
return exit(0);  // 其他命令放行
```

**白名单规则**：
- ✅ 放行：`find ... | while ... grep`（Explorer batch 模式）
- ✅ 放行：`npm test`、`git status`、`npm run check`（非文件读取）
- ✅ 放行：任何管道组合命令
- ❌ 拦截：`cat file.py`（单文件绕路）
- ❌ 拦截：`grep pattern file.py`（非管道 grep）
- ❌ 拦截：`head -20 file.py`（截断式绕路）

**逃生门**：`touch /tmp/bash-raw-unlock-$PPID`（10 分钟过期）

**与现有 hook 的兼容**：

Forge 已有 3 个 PreToolUse hook on Bash matcher：
1. `inject-plan-context.mjs`（注入 plan 上下文）
2. `check-frozen.js`（冻结区检查）

bash-ban 作为第 4 个 PreToolUse Bash hook，不影响前三个（它们不做命令内容检查）。

**涉及文件**：
- `scripts/bash-ban-raw.mjs` — 新增
- `hooks/hooks.json` — 注册新 hook

### Layer 3: 全局压缩阈值（新增）

**替代**：`track-read-budget.mjs`（Read 累积追踪）

**配置**：
```json
{
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"
  }
}
```

**为什么 60% 而非文章建议的 50%**：
- Forge 有 `inject-plan-context.mjs` 在 PreToolUse 注入 plan 上下文
- 50% 过于激进，可能在 plan 注入后立即触发 compact，导致注入的内容被压缩掉
- 60% 是保守选择，配合 `forge_compact_restate_reminder` 确保 compact 后重注入

**与 compact restatement 的协同**：
```
上下文达到 60%
→ 触发 auto-compact
→ compact 完成后
→ forge_compact_restate_reminder hook 注入关键上下文
→ 继续工作
```

**涉及文件**：
- `hooks/hooks.json` — env 字段新增
- `scripts/track-read-budget.mjs` — 标记 deprecated（不删除，注释说明）

### Layer 4: context-mode（默认安装，forge init Step 7）

**工具**：[context-mode](https://github.com/mksglu/context-mode)

**适用场景**：
- `npm test` 输出数千行日志（超出 `forge_exec` + RTK 的处理范围）
- 构建日志、CI 输出等超大输出（>1000 行）
- 需要 BM25 索引后续按需 retrieve 的场景

**与 `forge_exec` + RTK 的关系**：
```
forge_exec（Layer 0）            context-mode（Layer 4）
├── 执行命令 + RTK 压缩          ├── 沙箱执行命令
├── Iron Law（不压失败输出）      ├── BM25 索引完整输出
├── deny patterns                ├── 只返回摘要
└── 60-90% 压缩（常规输出）      └── 按需 retrieve 细节
```

两者互补：`forge_exec` + RTK 处理常规命令输出（<1000 行），context-mode 处理超大输出场景。

**安装**：
```bash
claude plugin marketplace add mksglu/context-mode
npm install -g context-mode
```

**不涉及 Forge 代码变更**。由 `forge init` 自动安装，安装失败时输出手动安装命令。

**Fallback**：context-mode 不可用时，大输出由 `forge_exec` + RTK 处理，无额外功能损失。

### Layer 5: Headroom + RTK（默认安装，forge init Step 7）

**工具**：[headroom-ai](https://github.com/chopratejas/headroom)

**价值**：
- CacheAligner：稳定 prompt 前缀 → Anthropic KV cache 命中率 ↑
- 全量压缩：对话历史 + CLAUDE.md + 规则文件（47-92%↓）
- `headroom learn`：挖掘失败会话，自动写修正到 CLAUDE.md
- 内含 RTK：不需要单独安装，RTK 也用于 `forge_exec` 的默认压缩引擎

**安装方式**（由 `forge init` 自动执行）：
```bash
pip install "headroom-ai[all]"
```

**使用方式**（`forge init` 完成输出中提示）：
```bash
# 用 Headroom wrapper 启动 Claude Code（替代直接 claude 命令）
headroom wrap claude
```

**风险与缓解**：
- 代理层通过 `ANTHROPIC_BASE_URL` 拦截 API 调用 → 不使用 `headroom wrap` 时直连 API
- `inject-plan-context.mjs` 动态注入会改变 prompt 前缀，降低 CacheAligner 效果 → 边际收益约 15-25%，仍为正
- 增加调试复杂度 → Headroom 有 `headroom stats` 查看压缩效果

**Fallback**：不使用 `headroom wrap claude` 时，Forge 直连 API，Headroom 的压缩功能不生效但不影响运行。

### Layer 6: Caveman（默认安装，forge init Step 7）

**工具**：[caveman](https://github.com/JuliusBrussee/caveman)

**价值**：把 Claude 回复压成寄存器模式，去除客套话。50-75%↓ 回复 token。

**安装方式**（由 `forge init` 自动执行）：
```bash
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman
```

**Forge 结构化输出排除列表**：Caveman 需要排除以下 Forge 输出模式不被压缩：
- Spec 文档（`# Spec:` / `# Requirements Document`）
- ADR 决策记录（`# ADR-`）
- Review 报告（`📋 审查结果摘要` / `P0:` / `P1:`）
- TDD 循环输出（`RED:` / `GREEN:` / `REFACTOR:`）
- 验证输出（`✅` / `⛔` / `⚠️`）

**Fallback**：Caveman 不可用时，§2.6 Output Conciseness 行为规则继续生效。
  "caveman@caveman": {}
}
```

## Prompt 缓存策略

### 当前状态

```json
// .claude/settings.json:153
"ENABLE_PROMPT_CACHING_1H": "false"
```

Forge **刻意禁用**了 1 小时缓存。可能原因：`inject-plan-context.mjs` 在 PreToolUse 动态注入 plan 上下文，导致 prompt 前缀不稳定，cache miss 反增消耗。

### 验证方案

1. 选一个典型 `/forge build` 会话，记录总 token 消耗（cache off）
2. 开启 `ENABLE_PROMPT_CACHING_1H=1`，重复相同会话，记录总 token 消耗（cache on）
3. 对比：如果 cache on 的消耗更低 → 改为 `"1"`；如果更高或持平 → 保持 `"false"`

## 冲突分析总结

| 新机制 | 冲突对象 | 严重度 | 解决方案 |
|--------|---------|--------|---------|
| `AUTOCOMPACT=60%` | `forge_compact_restate_reminder` | ✅ 无冲突 | compact 后自动重注入 |
| `bash-ban-raw` | Explorer batch 脚本 | 🟡 需白名单 | 管道组合放行，只封单文件读取 |
| CRG | Explorer batch 脚本 | 🟡 功能重叠 | Fallback Ladder 替代 |
| CRG | `forge_read_cached` | ✅ 互补 | CRG 替代读需求，缓存兜底 |
| RTK（集成到 forge_exec） | `trimCommandOutput` trimmer | 🟢 升级 | RTK 是默认引擎，trimmer 降级为 fallback |
| context-mode | `forge_exec` + RTK | ✅ 互补 | 不同层，超大输出场景 |
| Headroom CacheAligner | `inject-plan-context.mjs` | 🟡 效果打折 | 动态注入降低 cache 命中 |
| Caveman | §2.6 结构化输出 | 🟢 低风险 | 配置排除列表 |
| bash-ban | `forge_exec` MCP | ✅ 无冲突 | MCP 工具绕过 PreToolUse Bash hook |
| `PROMPT_CACHING=1` | 当前 `"false"` | 🔴 需验证 | A/B 测试后决定 |

## 配置方案

### 必选配置（写入 hooks/hooks.json）

```jsonc
// hooks/hooks.json 新增
{
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"
    // ENABLE_PROMPT_CACHING_1H 待 A/B 验证后决定
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "node scripts/bash-ban-raw.mjs 2>/dev/null || true",
          "timeout": 2
        }]
      }
    ]
  }
}
```

### `forge init` Step 7 自动安装（默认）

```bash
# forge init 自动执行以下安装（失败不阻断）：

# a. CRG（代码知识图谱）
pip install code-review-graph
code-review-graph install --platform claude-code
code-review-graph build

# b. Headroom + RTK（API 压缩 + Shell 压缩）
pip install "headroom-ai[all]"

# c. context-mode（大输出沙箱）
claude plugin marketplace add mksglu/context-mode
npm install -g context-mode

# d. Caveman（回复压缩）
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman
```

**用户无需手动安装**。`forge init` 完成后所有工具就绪。如果某个工具安装失败，`forge init` 输出中会显示手动安装命令。

## 退役计划

| 机制 | 退役时机 | 替代者 | 退役方式 |
|------|---------|--------|---------|
| `forge_read_cached` | CRG 安装后 | CRG + forge_read | 注释 deprecated，不删除 |
| Explorer batch 脚本 | CRG 安装后 | CRG query_graph_tool | explore.md 加 fallback 分支 |
| `track-read-budget.mjs` | AUTOCOMPACT=60% 生效后 | AUTOCOMPACT 全局阈值 | 注释 deprecated，不删除 |
| §2.6 Output Conciseness | Caveman 安装后 | Caveman 强制压缩 | 保留作为 Caveman 不可用时的 fallback |

## 测试策略

1. **回归测试**：`npm run check` 通过（所有改动不影响现有代码）
2. **bash-ban 单元测试**：验证过滤逻辑（拦截 cat/grep、放行管道、放行 forge_exec）
3. **CRG fallback 测试**：模拟 CRG 不可用，验证 Explorer 回退到 batch 脚本
4. **A/B 测试**：对比 AUTOCOMPACT=60% vs 95% 的会话寿命
5. **端到端测试**：完整 `/forge plan → build → review → test → ship` 流程
