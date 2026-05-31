---
name: token-layered-defense
status: draft
created: "2026-05-31"
updated: "2026-05-31"
tier: standard
source_ref:
  - "https://x.com/vincemask/status/2060298054599934424"
  - "https://github.com/tirth8205/code-review-graph"
  - "https://github.com/chopratejas/headroom"
  - "https://github.com/mksglu/context-mode"
  - "https://github.com/JuliusBrussee/caveman"
---

# Token 分层防御体系 — 需求文档

## 引言

Forge 在实际开发中反复遭遇上下文爆炸问题：

- **会话短命**：200K 上下文窗口约 30 分钟即耗尽，复杂 build/review 任务无法在单会话内完成
- **代码探索浪费**：`/forge plan` 阶段的 Explorer agent 用 grep 逐文件扫描，单次探索消耗 ~400K token
- **Shell 输出噪音**：`npm test`、`git diff`、`npm run check` 等命令全量输出直接灌入上下文，占 60-80% 的 token 消耗
- **Bash 绕路**：Claude 通过 `cat file.py`/`grep pattern src/` 绕过 Read 工具，原始输出直接进入上下文
- **回复冗余**：Claude 的客套话、铺垫、重复解释消耗大量 token

经调研 vincemask 文章「如何用 5 个工具 + 自定义 Hooks 把 Claude Code Token 消耗砍掉 90%+」及相关工具链（CRG、Headroom、context-mode、Caveman），结合 Forge 自身已有的 4 个 MCP 工具和 10 层优化机制，制定本分层防御方案。

### 核心原则

> **Instructions are advisory. Hooks are physics.**
> 不依赖模型自觉省 token，把省 token 变成默认执行的物理定律。

### 与现有机制的关系

经逐项冲突分析，Forge 现有 10 个 token 相关机制分为三类：

| 分类 | 机制 | 决策 |
|------|------|------|
| **保留**（工作流基础设施） | `forge_exec`（命令执行+deny+iron law）、`forge_read`（批量分析+FORGE_FILES）、`forge_git`（结构化 Git 数据源）、`context-budget.ts`（类型化序列化协议）、`inject-plan-context.mjs`（阶段感知注入）、Phase isolation gates、Compact restatement、`disallowedTools` + frozen zone | 不变 |
| **废弃**（新工具上位替代） | `forge_read_cached`（CRG 替代）、Explorer batch 脚本（CRG 替代）、`track-read-budget.mjs`（AUTOCOMPACT 替代）、§2.6 Output Conciseness（Caveman 替代） | 逐步退役 |
| **增强**（叠加新能力） | — | 新增 6 层防御 |

## 术语

| 术语 | 定义 |
|------|------|
| **CRG** | code-review-graph，基于 tree-sitter AST 的代码知识图谱 MCP 工具 |
| **RTK** | Rust Token Killer，CLI 输出压缩 Rust 二进制 |
| **CBM** | Codebase Memory MCP，文章中的知识图谱工具（本方案选用 CRG 替代） |
| **Headroom** | API 级全量压缩代理，在请求离开本机前压缩整个 prompt |
| **context-mode** | 大输出沙箱工具，命令在子进程中运行，只返回摘要 |
| **Caveman** | 回复压缩工具，把 Claude 的输出压成"寄存器模式" |
| **bash-ban** | PreToolUse hook，拦截 Bash 中的裸文件读取命令 |
| **Iron Law** | Forge 铁律：失败输出（exit ≠ 0）永远不被压缩 |
| **Fallback Ladder** | 降级阶梯：工具不可用时逐级回退到替代方案 |

## 需求

### Requirement 1: 全局压缩阈值优化

**User Story:** 作为 Forge 用户，我希望上下文窗口在 60% 时就触发自动压缩，而不是等到 95% 才救火，以延长会话寿命。

#### 验收标准

1. THE `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` SHALL 设置为 `"60"`（当前未显式配置，使用默认 95%）
2. THE 设置 SHALL 写入 `hooks/hooks.json` env 字段，用户安装 Forge 即自动生效
3. THE 设置 SHALL 与现有的 `forge_compact_restate_reminder`（compact 后重注入关键上下文）协同工作，无冲突

### Requirement 2: Bash 裸命令拦截门禁

**User Story:** 作为 Forge 维护者，我希望阻止 Claude 通过 `cat`/`head`/`tail`/`grep`/`find` 等 Bash 裸命令绕过工具层直接读取文件，避免原始输出未经压缩直接灌入上下文。

#### 验收标准

1. THE PreToolUse hook（名称 `bash-ban-raw-tools`）SHALL 在 Bash 工具调用前检测命令内容
2. THE hook SHALL 拦截以 `cat`、`head`、`tail`、`grep`、`rg`、`wc` 开头的**单文件读取**命令（非管道组合）
3. THE hook SHALL **放行** Explorer agent 的批量分析脚本模式（`find ... | while ... grep` 管道组合）
4. THE hook SHALL 提供 10 分钟过期的逃生门：`touch /tmp/bash-raw-unlock-$PPID`
5. THE hook 拦截时 SHALL 返回 exit 2（阻断）并输出替代建议（"Use Read/Grep/Glob tools instead"）
6. THE hook SHALL 不影响 `forge_exec` MCP 工具的命令执行（MCP 工具绕过 PreToolUse Bash hook）

### Requirement 3: 代码知识图谱（CRG 集成）

**User Story:** 作为 Forge 用户，我希望 `/forge plan` 和 `/forge review` 阶段通过代码知识图谱查询代码结构，而不是逐文件 grep 扫描，以节省 99% 的代码探索 token。

#### 验收标准

1. THE code-review-graph（CRG）SHALL 作为**可选 companion tool** 安装，不强制依赖
2. THE Forge 的 Explore agent（`agents/explore.md`）SHALL 实现 Fallback Ladder：
   - L0：CRG 可用 → `query_graph_tool`（~100 tokens）
   - L1：无 CRG → 保留现有 "Think in Code" batch 脚本（~3K tokens）
3. THE CRG 的 `get_impact_radius_tool` SHALL 用于 `/forge plan` 的 Ripple 检查，替代手动 grep 追踪调用链
4. THE CRG 的 `detect_changes_tool` SHALL 用于 `/forge review`，自动计算 blast-radius
5. WHEN CRG 不可用，THE Forge 所有功能 SHALL 正常工作，仅回退到现有 grep/batch 方案

### Requirement 4: RTK 默认压缩引擎

**User Story:** 作为 Forge 用户，我希望 `forge_exec` 的成功输出使用 RTK（Rust Token Killer）进行高质量压缩（60-90%↓），而不是当前简单的 key-line 正则提取，以大幅减少 Shell 输出噪音。

#### 验收标准

1. THE `forge_exec` SHALL 实现 RTK Fallback Ladder：
   - L0：RTK 可用（`rtk` 二进制在 PATH 中）→ 使用 RTK 压缩成功输出（exit = 0）
   - L1：RTK 不可用 → 回退到现有 `trimCommandOutput()`（key-line 正则提取）
2. THE RTK 压缩 SHALL **仅处理成功输出**（exit = 0）。失败输出（exit ≠ 0）永远绕过 RTK，保持 Iron Law 不变
3. THE RTK 集成 SHALL 在 `forge_exec` 内部实现（`src/mcp/tools/forge-exec.ts`），作为压缩引擎的替换，不改变 `forge_exec` 的命令执行、deny patterns、超时保护等工作流逻辑
4. THE `forge_git` 的 diff-content 截断策略 SHALL 保持现有优先级排序（source > config > tests > generated），不使用 RTK（`forge_git` 输出结构化数据，不适合通用文本压缩）
5. THE 现有 `trimmers/output.ts` SHALL 标记为 fallback，在 RTK 不可用时自动启用
6. THE `forge_exec` 的输出裁剪效果 SHALL 满足以下基准：
   - `npm test`（成功，200+ 行）→ RTK 压缩后 ≤30% 原始 token
   - `npm run check`（成功，100+ 行）→ RTK 压缩后 ≤40% 原始 token
   - 任意命令（失败）→ 100% 原始输出不变
7. THE `forge init` SHALL 尝试安装 RTK（随 Headroom 附带：`pip install headroom-ai[all]`）

### Requirement 5: Prompt 缓存策略

**User Story:** 作为 Forge 用户，我希望开启 1 小时 prompt 缓存以减少重复 system prompt 加载的 token 消耗。

#### 验收标准

1. THE `ENABLE_PROMPT_CACHING_1H` SHALL 从当前值 `"false"` 改为 `"1"`
2. THE 改动 SHALL 先进行 A/B 验证：确认 `inject-plan-context.mjs` 的动态注入不会导致 cache miss 反而增加消耗
3. IF 验证发现动态注入破坏 cache 稳定性，THE 设置 SHALL 保持 `"false"` 并记录原因

### Requirement 6: 回复精简强制执行（Caveman 默认启用）

**User Story:** 作为 Forge 用户，我希望 Claude 的回复自动去除客套话和重复解释，只保留技术信息。

#### 验收标准

1. THE `forge init` SHALL 在 Step 7 中安装 Caveman 插件（`claude plugin marketplace add JuliusBrussee/caveman`）
2. THE Caveman 的压缩 SHALL 不影响 Forge 的结构化输出（Spec、ADR、Review 报告、TDD 循环输出），需配置排除列表
3. THE 现有 §2.6 Output Conciseness 规则 SHALL 在 Caveman 不可用时继续生效
4. IF Caveman 安装失败，THE `forge init` SHALL 输出警告并继续（不阻断初始化）

### Requirement 7: 大输出沙箱（context-mode 默认启用）

**User Story:** 作为 Forge 用户，我希望测试/构建日志等大输出在沙箱中执行，只返回摘要，需要细节时按需检索，将会话从 30 分钟延长到 3 小时以上。

#### 验收标准

1. THE `forge init` SHALL 在 Step 7 中安装 context-mode（`claude plugin marketplace add mksglu/context-mode` + `npm install -g context-mode`）
2. THE context-mode SHALL 处理 `forge_exec` + RTK 之外的超大输出（>1000 行），如完整测试套件日志、构建日志
3. THE context-mode 的 BM25 索引 SHALL 允许后续按需 retrieve 细节，不丢失信息
4. IF context-mode 安装失败，THE `forge init` SHALL 输出警告并继续（不阻断初始化）

### Requirement 8: API 级全量压缩（Headroom 默认启用）

**User Story:** 作为 Forge 用户，我希望在 API 请求离开本机前，对整个 prompt（对话历史、CLAUDE.md、规则文件）进行全量压缩，进一步减少 47-92% 的 token 消耗。

#### 验收标准

1. THE `forge init` SHALL 在 Step 7 中安装 Headroom（`pip install headroom-ai[all]`），RTK 随 Headroom 自带安装
2. THE Headroom SHALL 通过 shell wrapper（`headroom wrap claude`）运行，对 API payload 进行全量压缩
3. THE Headroom 的 CacheAligner SHALL 稳定 prompt 前缀，提高 Anthropic KV cache 命中率
4. THE Headroom 的 `headroom learn` SHALL 与 Forge 的 `/forge learn` 互补，自动挖掘失败会话写入 CLAUDE.md
5. IF Headroom 安装失败，THE `forge init` SHALL 输出警告、回退到非代理模式，不阻断初始化
6. THE `forge init` SHALL 在完成输出中显示 Headroom wrapper 使用说明（如何用 `headroom wrap claude` 替代直接 `claude` 启动）

### Requirement 9: `forge init` Companion 工具安装流程

**User Story:** 作为 Forge 新用户，我希望 `forge init` 一键安装所有推荐的 token 优化工具，不需要手动逐个配置。

#### 验收标准

1. THE `forge init` Step 7 SHALL 扩展为「Token 优化工具安装」，按顺序安装以下工具（安装失败不阻断后续工具）：
   - a. code-review-graph（`pip install code-review-graph`）— 代码知识图谱
   - b. Headroom + RTK（`pip install headroom-ai[all]`）— API 压缩 + Shell 压缩
   - c. context-mode（`claude plugin marketplace add mksglu/context-mode && npm install -g context-mode`）— 大输出沙箱
   - d. Caveman（`claude plugin marketplace add JuliusBrussee/caveman`）— 回复压缩
2. THE 每个工具安装后 SHALL 调用其初始化命令（如 CRG 的 `code-review-graph build`）
3. THE `forge init` 完成输出 SHALL 显示已安装工具列表和未安装工具的 fallback 说明
4. THE 所有工具安装失败时，THE Forge 核心功能 SHALL 正常工作（纯 fallback 模式）

## 正确性属性

### P0：不可破坏的工作流逻辑

1. **Iron Law 不可违反**：`forge_exec` 的失败输出（exit ≠ 0）**永远**不被任何层压缩或截断
2. **序列化协议不可破坏**：`context-budget.ts` 的 6 种类型化序列化器必须保持可反序列化（主 agent 依赖结构化数据做流程决策）
3. **阶段注入不可中断**：`inject-plan-context.mjs` 的按阶段 plan 上下文注入必须正常工作
4. **安全控制不可削弱**：`disallowedTools`、frozen zone check、deny patterns 不可被新工具绕过

### P1：降级安全性

1. **CRG 不可用时零影响**：所有 Forge 功能在无 CRG 时正常工作
2. **bash-ban 白名单安全**：批量分析脚本不被误拦截
3. **任何 companion 工具安装失败不阻断 forge init**：每个工具独立安装，失败跳过
4. **Headroom 代理层故障不阻断**：不使用 `headroom wrap claude` 时 Forge 正常运行

## 非功能性需求

### 性能

- bash-ban hook 执行时间 < 50ms（简单正则匹配）
- CRG 图查询延迟 < 100ms（CRG benchmark：< 1.5ms）
- 无新增性能瓶颈

### 兼容性

- 所有改动兼容 Forge 的 marketplace plugin 安装方式
- CRG 和其他外部工具通过 MCP 协议共存，不与 Forge MCP 冲突
- 支持多个 MCP server 同时运行（Claude Code 标准）

### 可维护性

- 新增 hook 脚本放在 `scripts/` 目录，遵循 Forge 现有 hook 命名约定
- companion 工具检测脚本在 SessionStart hook 中调用
- 所有配置变更可回滚

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `ENABLE_PROMPT_CACHING_1H=1` 导致 cache miss | 反增 token 消耗 | 先 A/B 验证，不稳定则保持 false |
| bash-ban 误拦截 Explorer 批量脚本 | 代码探索瘫痪 | 白名单管道组合模式 |
| CRG MCP server 崩溃 | 代码图谱不可用 | Fallback ladder 自动回退到 grep |
| Headroom 代理层与 Forge MCP 冲突 | API 调用失败 | 不使用 `headroom wrap` 时直连 API，代理层可随时移除 |
| Caveman 过度压缩 Forge 结构化输出 | Review/Spec 信息丢失 | 配置 Caveman 排除列表 |
| context-mode 与 forge_exec trimmer 冲突 | 双重裁剪 | context-mode 只处理 forge_exec 未覆盖的超大输出 |
| `forge init` 网络不通导致工具安装全部失败 | 无 companion 工具 | 所有工具均有内置 fallback，Forge 核心不受影响 |
| pip/npm/claude plugin 命令不在 PATH 中 | 部分工具无法安装 | 检测命令可用性，跳过不可用的工具并输出手动安装指南 |

## 参考资料

- [vincemask 原文](https://x.com/vincemask/status/2060298054599934424)
- [code-review-graph](https://github.com/tirth8205/code-review-graph)（本方案选用的知识图谱工具）
- [Headroom](https://github.com/chopratejas/headroom)（API 级压缩代理）
- [context-mode](https://github.com/mksglu/context-mode)（大输出沙箱）
- [Caveman](https://github.com/JuliusBrussee/caveman)（回复压缩）
- Forge 现有上下文防御：`.forge/progress/context-explosion-defense.md`（已完成 17/17）
- Forge MCP 工具：`src/mcp/tools/`（forge_exec、forge_read、forge_git、forge_read_cached）
- Forge 序列化协议：`src/context-budget.ts`
