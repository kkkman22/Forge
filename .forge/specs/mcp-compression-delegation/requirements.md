---
name: mcp-compression-delegation
status: draft
feature: mcp-compression-delegation
layout: requirements
created: "2026-06-18"
updated: "2026-06-18"
priority: P2
tier: light
source: Headroom vs RTK vs Forge MCP 功能重叠调研 + 压缩器实测（5 轮）
---

# MCP 压缩职责移交 — 需求文档

## 背景

### 痛点：压缩能力三重冗余 + 安全层被误判为可删

Forge 的上下文压缩体系经历了多轮自研堆叠，目前与外部压缩工具（Headroom、RTK）存在严重的职责重叠，且 forge-exec 的**安全边界**被"压缩工具"的定位掩盖，导致难以判断"哪些该留、哪些该删"：

- **RTK 集成**（`src/mcp/tools/forge-exec.ts:587`）：作为 forge_exec 的可选 shell 输出压缩器，被 `init.sh` 默认安装捆绑。
- **forge_exec 内置 trimmer**（`src/mcp/trimmers/output.ts`）：RTK 不可用时的 fallback（正则提关键行）。
- **forge_read_cached**（`src/mcp/tools/forge-read-cached.ts`）：Read 去重缓存（v3.2 已 deprecated，但 6 处 skills 仍引用）。
- **Headroom**（外部，`init.sh` 默认引导 `headroom wrap claude`）：API 级 prompt 压缩代理。

四个组件，三处在压同一批 shell 输出，职责边界模糊。

### 根因：压缩能力已被 Headroom 完全覆盖，且实测更优

调研 + 实测（2026-06-18，headroom v0.26.0，proxy `/v1/compress` 端点，3 类 Forge 真实样本）证实：

**1. Headroom 的覆盖范围 ⊃ RTK。** Headroom 压对话历史 + tool 输出 + 模型写回 + RAG；RTK 只压 shell 输出。同时启用 = 二次压缩（RTK 先压一道，Headroom 再压一道）。

**2. Forge Iron Law 的核心场景实测零风险**（推翻了基于文档的悲观推测）：

| Iron Law 保护对象 | Headroom 实测行为 | router 判定 | 压缩率 |
|------------------|------------------|-----------|--------|
| 失败输出（test 失败 + 堆栈 + 边界上下文） | **零压缩，完整保留** | `router:protected:error_output` | 0% |
| diff hunk（unified diff + `@@` 标记） | **零压缩，`@@`/`diff --git` 全保留** | `router:noop` | 0% |
| Structured Output（R2 Handoff / Decision Point） | 压 50%，删部分验证元数据 | `router:tool_result:text` | 50% |

`router:protected:error_output` 是文档未明说但实测确凿的路由——失败输出被识别后完全保护，包括不含 ERROR/FAILED 关键词但有 debug 价值的 setup 上下文。**Forge 的 Iron Law（失败输出永不压缩）在 Headroom 下基本无感。**

**3. Structured Output 被压是唯一真实风险，但影响有限且有 CCR 兜底。** 压缩后末尾自动附 CCR marker：`[253 items compressed to 122. Retrieve more: hash=f16f56a35f40d47df241e369]`，原文存本地 cache 可检索。实测删除的是 `procedure_compliance` / `INV-5/6` 这类验证元数据，核心进展字段（task_id / completed / commands_executed / issues_found）保留。

**4. 禁用 Kompress（`HEADROOM_DISABLE_KOMPRESS=1`）得不偿失。** 能保住 Structured Output，但会让大日志（6812 token，原压 77%）整个 noop——为 740 token 的小内容牺牲数万 token 的大内容，违背用 Headroom 的初衷。

### 关键澄清：安全层 ≠ 压缩层

forge_exec 真正的价值从来不是压缩（那块被 Headroom 盖过），是 **P0 安全边界**（`src/mcp/tools/forge-exec.ts:92`）：

- `EXACT_ALLOWED_COMMANDS`（只读命令白名单）
- `containsShellMetachars`（防注入）
- `execCommandTracked` + `reapProcessTree`（超时清理子进程，防僵尸）

Headroom 是 HTTP 压缩代理，**完全不碰命令执行安全**。砍掉 forge_exec 等于拆掉事前防线——安全控制是事前的，压缩是事后的，两者正交。

### 与现有 spec 的关系

- **`context-explosion-defense`**（completed，五层防御 Layer 1-5）：Layer 1（forge_read_cached）本 spec 标记删除；Layer 2-5（阶段隔离、subagent 文件化、phase-aware resume、预算监控）**不受影响**——它们管"跨阶段累积"和"subagent 返回"，Headroom 管不了。
- **`context-optimization`**（completed，forge_exec/git/read MCP）：本 spec 精简其中的压缩职责，保留安全 + 隔离职责。
- **`regenerative-checkpoint`**（completed）：管"会话状态保全"，正交，不受影响。

## 目标

将 Forge 的压缩职责移交给 Headroom，同时保留 Headroom 永远做不到的**执行安全层**和**内容隔离层**。

- 删除与 Headroom 重叠的压缩能力（RTK、trimmer、read_cached）。
- 保留 forge_exec 的安全 allowlist + metachar 检测 + 进程清理（Iron Law 保障改由 Headroom 的 `protected:error_output` 兜底）。
- 保留 forge_read 的沙箱结构化分析（imports/contains/line_count/json_keys，文件原文不进上下文）。
- 重新定位 Forge MCP：从"上下文压缩工具"转为"安全执行 + 内容隔离边界"。

## 需求

### 1. 删除 RTK 集成

移除 `forge_exec` 对 RTK 的调用。RTK 在 Forge 中仅有一处调用点（`src/mcp/tools/forge-exec.ts:587`），且作为可选压缩器存在内置 fallback。

**行为变更**：
- `forge_exec` 不再探测 RTK（`isRtkAvailable()` 调用移除）。
- 输出不再经过 RTK 压缩。
- 失败输出（exitCode ≠ 0）的 Iron Law 保障不变——继续原样返回（`formatFailureOutput`）。
- 成功的长输出：不再做内置 trimmer 裁剪，原样返回，由 Headroom 在 HTTP 层压缩。

**验收条件**：
- [ ] `isRtkAvailable`、`trimWithFallback`、`rtkCompress` 从 `src/mcp/trimmers/output.ts` 移除。
- [ ] `src/mcp/tools/forge-exec.ts` 移除 RTK 相关 import 和调用。
- [ ] `formatFailureOutput`（Iron Law 失败放行）保留。
- [ ] `trimCommandOutput`（fallback trimmer）保留——作为 Headroom 未启用时的兜底（Headroom 不是强制的，用户可能直连 API）。
- [ ] `test/mcp/forge-exec-rtk.test.ts` 删除（RTK 集成已移除，测试无对应实现）。
- [ ] 现有 forge_exec 安全测试全部通过（安全边界未松动）。
- [ ] adversarial-mcp-boundaries 安全测试全绿。

### 2. 删除 forge_read_cached

forge_read_cached（Layer 1 Read 去重）v3.2 已 deprecated，Headroom 的对话压缩间接覆盖其功能。

**行为变更**：
- `forge_read_cached` MCP 工具从 server 注册中移除。
- `src/mcp/tools/forge-read-cached.ts` 和 `src/mcp/read-cache.ts` 删除。
- 6 处 skills 引用（build/review/test instructions.md + context-budget.md）改为引导"用 Grep 替代全量重读"。

**验收条件**：
- [ ] `src/mcp/tools/forge-read-cached.ts` 删除。
- [ ] `src/mcp/read-cache.ts` 删除。
- [ ] MCP server 注册中 `forge_read_cached` 工具移除。
- [ ] skills 中 6 处 `forge_read_cached` 引用更新为 Grep 引导。
- [ ] barrel export（`src/index.ts`）移除 read-cache 相关导出。
- [ ] public-api 检查通过。
- [ ] dist-sync 一致。

### 3. forge_exec 保留安全层，移除压缩编排

明确 forge_exec 的职责边界：安全执行 + Iron Law 失败放行，不再做成功输出的压缩编排。

**保留**：
- `EXACT_ALLOWED_COMMANDS` / `ALLOWED_NPM_RUN_SCRIPTS` / `ALLOWED_GIT_SUBCOMMANDS`（只读白名单）
- `isCommandAllowed` / `isCommandDenied`（命令准入）
- `containsShellMetachars` / `isSimpleCommand`（防注入）
- `execCommandTracked` / `reapProcessTree`（进程清理）
- `formatFailureOutput`（Iron Law：失败原样返回）
- `trimCommandOutput`（Headroom 未启用时的 fallback；启用时输出原样过，Headroom 在 HTTP 层压）

**移除**：
- RTK 探测与调用（需求 1）
- `legacyTypedReplacementWarning`（可选，历史遗留，可一并清理）

**验收条件**：
- [ ] forge_exec 工具名、参数 schema、返回格式不变（向后兼容）。
- [ ] 安全相关函数（isCommandAllowed 等）签名不变。
- [ ] forge_exec 测试中"失败输出原样返回"用例通过。
- [ ] forge_exec 测试中"allowlist 拦截"用例通过。
- [ ] adversarial-mcp-boundaries 测试全绿。

### 4. init.sh 移除 RTK 安装

彻底移除 RTK 安装引导，不保留 opt-in。Headroom 保留默认引导（wrap 模式）。

**为什么不留 opt-in**：RTK 在 Forge 中仅有一处调用点（需求 1 已删除），删除调用后 RTK 对 Forge 完全无影响。留 opt-in 会误导用户以为 RTK 是 Forge 推荐的补充——但它与 Headroom 冗余且实测更劣。冗余项应明确删除，不用"可选"含糊处理。已装 RTK 的用户不受影响（只是多了个未使用的二进制，零副作用）。

**行为变更**：
- `init.sh` 的 companion 安装段：Headroom 单独安装（`pip install 'headroom-ai[all]'`），不再捆绑 RTK。
- RTK 从安装流程完全移除，不保留任何 opt-in 路径。
- 安装摘要表移除 rtk 行。
- `scripts/check-companions.mjs` 移除 RTK 检测项。

**验收条件**：
- [ ] `init.sh` 中 `install_companion "Headroom + RTK"` 改为 `install_companion "Headroom"`，移除 RTK 安装逻辑。
- [ ] `init.sh` 安装摘要表移除 rtk 行。
- [ ] `init.sh` Headroom 使用说明段（line 923-926）保留。
- [ ] `scripts/check-companions.mjs` 的 `COMPANIONS` 数组移除 RTK 条目。
- [ ] `scripts/check-companions.mjs` 注释中 RTK 描述移除。

### 5. 更新文档定位

`skills/forge/lib/build/references/context-budget.md` 的定位从"五层上下文防御体系"调整：
- Layer 1（Read 去重缓存）标记移除（已删除）。
- 压缩职责明确移交 Headroom。
- Forge MCP 重新定位为"安全执行 + 内容隔离"。

**验收条件**：
- [ ] context-budget.md 移除 forge_read_cached 相关段落。
- [ ] context-budget.md 新增"压缩职责由 Headroom 承担"说明。
- [ ] context-budget.md MCP 工具表更新（移除 forge_read_cached 行，forge_exec 描述改为"安全执行 + Iron Law"）。
- [ ] skill-length 检查通过。

## 验收标准

- [ ] `npm run check` 全绿（tsc + biome + vitest + public-api + dist-sync + skill/doc 校验）。
- [ ] forge_exec 安全测试（adversarial-mcp-boundaries）全绿。
- [ ] forge_exec 失败输出原样返回（Iron Law）行为不变。
- [ ] forge_read_cached 相关代码、测试、引用全部清理。
- [ ] RTK 从 Forge 完全移除（调用、测试、init 安装、check-companions 检测）。
- [ ] 文档定位更新，明确压缩职责移交 Headroom。

## 依赖

- **Headroom wrap 模式**：本 spec 假设用户使用 `headroom wrap claude`（`init.sh` 已默认引导）。Headroom 未启用时，forge_exec 仍保留 `trimCommandOutput` fallback。
- **无版本依赖**：本 spec 不依赖 Headroom 特定版本（实测基于 v0.26.0，但 `protected:error_output` / `noop` 路由行为在更早版本应一致）。

## 非目标

- **不改动 forge_git / forge_read 的功能**：这两个工具的安全 + 隔离职责不与 Headroom 重叠，本 spec 不碰。
- **不强制用户使用 Headroom**：Headroom 仍是可选的（`init.sh:926` 原文"不使用 headroom wrap 时 Forge 正常运行"）。本 spec 只删除与 Headroom 重叠的内部压缩代码，不把 Headroom 变成强依赖。
- **不重新实现压缩**：Forge 不再自带压缩算法，压缩完全交给 Headroom（或其 fallback trimmer）。
- **不处理 Structured Output 被压风险**：实测确认影响有限且有 CCR 兜底，不采取特殊措施（code fence 伪装已证无效，DISABLE_KOMPRESS 得不偿失）。
- **不改动 Headroom 本身**：Forge 作为 Claude Code 插件，无法影响宿主的 LLM client，不能做 SDK 直集成（架构拓扑不允许）。

## 实测数据附录

调研基于 2026-06-18 的实测（headroom v0.26.0 Docker 镜像，proxy `/v1/compress` 端点）：

| 样本 | 内容 | router | 压缩率 | 关键保留 |
|------|------|--------|--------|---------|
| A 失败输出（553 token） | 测试失败 + 堆栈 + 边界上下文 | `protected:error_output` | 0% | 完整，含无关键词的 setup 上下文 |
| B diff hunk（509 / 4080 token） | unified diff + `@@` 标记 | `noop` | 0% | `@@` / `diff --git` 全保留 |
| C Structured Output（740 token） | R2 Handoff + Decision Point | `tool_result:text` | 50% | 核心字段留，验证元数据删，附 CCR hash |
| D 大 JSON（2796 token） | 文件元数据数组 | `smart_crusher` | 55% | SmartCrusher 独立工作（不受 Kompress 影响） |
| E 大日志（6812 token） | 500 测试 + 2 失败 | `tool_result:text` | 77% | Kompress 启用时；禁用后 0% noop |

缓解措施实测：
- **code fence 伪装**（```markdown/bare/text 包裹样本 C）：❌ 无效，仍 `tool_result:text` 压 50%。
- **HEADROOM_DISABLE_KOMPRESS=1**：✅ 保住样本 C，但 ❌ 连累大日志 E 整个 noop（损失 77% 压缩）。得不偿失，不采纳。

样本数据存档于实验会话，可复现。
