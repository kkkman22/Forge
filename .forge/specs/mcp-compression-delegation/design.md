# MCP 压缩职责移交 — 设计文档

## 概述

本设计把 Forge 的上下文压缩职责移交给 Headroom，删除与 Headroom 重叠的压缩能力（RTK 集成、forge_read_cached），同时保留 Headroom 永远做不到的**执行安全层**（allowlist / metachar 检测 / 进程清理）和**内容隔离层**（forge_read 沙箱分析）。精简后 Forge MCP 与 Headroom 零功能重叠——Headroom 是事后压缩器（压 prompt 里已有的内容），Forge MCP 是事前控制层（控制执行什么命令、让什么内容进上下文）。

设计原则：**保守删除、激进保留安全。** 删除有 Headroom 完全覆盖的压缩路径（RTK、read_cached）；保留 Headroom 无法替代的每一行安全控制（forge_exec 的 allowlist/metachar/reap、forge_read 的沙箱）。Iron Law（失败输出永不压缩）的保障从"forge_exec 内部判断"改为"Headroom 的 `router:protected:error_output` 兜底 + forge_exec 仍保留的 `formatFailureOutput` 双保险"——实测确认 Headroom 对失败输出零压缩。

## 设计决策

### D1: RTK 彻底删除，不保留 opt-in

- **问题描述**：RTK 与 Headroom 冗余（覆盖范围 Headroom ⊃ RTK）。删除 RTK 调用后，是否保留 opt-in 安装路径给"想用 Bash 层额外压缩"的用户？
- **候选方案**：
  - A. 移除 forge_exec 调用，但 init.sh 保留 RTK 为可选 opt-in。
  - B. 彻底移除——调用、测试、init 安装、check-companions 检测全删。
- **选择理由**：选 B。RTK 在 Forge 中仅有一处调用点（`forge-exec.ts:587`），删除调用后 RTK 对 Forge 完全无影响。留 opt-in 会误导用户以为 RTK 是 Forge 推荐的补充——但它与 Headroom 冗余且实测更劣（Headroom 对失败输出有 `protected:error_output` 零压缩保护，对 diff 有 `noop` 零压缩，RTK 无此语义感知）。冗余项应明确删除，不用"可选"含糊处理。已装 RTK 的用户不受影响（只是多了个未使用的二进制，零副作用）。
- **风险和缓解**：无实质风险。RTK 的 fallback（`trimCommandOutput`）保留，Headroom 未启用时仍能裁剪输出。

### D2: trimCommandOutput 保留作为 fallback，非删除

- **问题描述**：既然压缩移交 Headroom，forge_exec 内置的 `trimCommandOutput`（正则提关键行）是否一并删除？
- **候选方案**：
  - A. 一并删除，压缩完全靠 Headroom。
  - B. 保留 `trimCommandOutput` 作为 Headroom 未启用时的 fallback。
- **选择理由**：选 B。Headroom 不是强依赖——`init.sh:926` 原文"不使用 headroom wrap 时 Forge 正常运行（直连 API）"。用户可能：① 不装 Headroom；② 装了但忘 `headroom wrap`；③ 用其他代理。这些场景下 forge_exec 若删了 trimmer，成功的大输出会原样灌进上下文，退回压缩前的状态。`trimCommandOutput` 代码量小（~20 行），保留成本极低，但删了的回退代价高。
- **风险和缓解**：双保险（forge_exec trimmer + Headroom）可能造成"轻微二次裁剪"——但实测 Headroom 对 <200 token 内容直接放行（noop），forge_exec trimmer 只在 >30 行才触发，两者触发条件几乎不重叠。

### D3: forge_read_cached 彻底删除

- **问题描述**：forge_read_cached（Layer 1 Read 去重）v3.2 已 deprecated，是否删除？
- **候选方案**：
  - A. 删除（源文件 + 测试 + skills 引用 + barrel export）。
  - B. 保留但标记 deprecated。
- **选择理由**：选 A。Headroom 的对话压缩间接覆盖了 Read 去重的核心价值（同文件多次读取的内容，在对话历史里重复出现，Headroom 会压缩）。保留一个已 deprecated、功能被覆盖的工具只会增加维护成本和认知负担。且 skills 里 6 处引用仍在引导用户用它，制造混乱。彻底删除 + 引导改用 Grep 是干净的处理。
- **风险和缓解**：极端场景下（用户不装 Headroom + 反复读同一大文件），失去去重缓存。缓解：skills 引导改为"同一文件 Read ≤2 次，第 2 次起用 Grep"——这是比缓存更通用的纪律。

### D4: Iron Law 双保险——forge_exec formatFailureOutput + Headroom protected:error_output

- **问题描述**：移除 RTK 后，失败输出（exitCode ≠ 0）的 Iron Law 保障由谁负责？
- **候选方案**：
  - A. 完全依赖 Headroom 的 `router:protected:error_output`。
  - B. forge_exec 保留 `formatFailureOutput`（失败原样返回）+ Headroom 兜底，双保险。
- **选择理由**：选 B。实测确认 Headroom 对失败输出零压缩（`router:protected:error_output`，2212 字符进 2213 出）。但 Headroom 非强依赖（D2），用户不 wrap 时 Headroom 不在场。`formatFailureOutput` 是 forge_exec 已有的、零成本的失败放行逻辑（`stderr ? stdout + STDERR + stderr : stdout`），保留它确保"无论 Headroom 在不在，失败输出都原样进上下文"。两层独立、互不依赖。
- **风险和缓解**：无。两层保护目标完全一致（失败输出原样返回），不会冲突。

### D5: forge_exec 保留安全层全部，仅移除压缩编排

- **问题描述**：forge_exec 的安全相关函数（allowlist / metachar / 进程清理）是否需要重构或合并？
- **候选方案**：
  - A. 借此机会重构安全层（合并/拆分函数）。
  - B. 安全层原样保留，只移除 RTK 调用和压缩编排。
- **选择理由**：选 B。本 spec 的目标是"移交压缩职责"，不是"重构安全层"。安全层是 P0 边界，`adversarial-mcp-boundaries` 测试覆盖它，原样保留 = 风险最低。重构安全层属于另一个 spec 的范畴（若未来需要）。本次只做最小必要改动：移除 RTK import + 调用，其余不动。
- **风险和缓解**：`legacyTypedReplacementWarning`（历史遗留，提示用 forge_docs_drift 替代 forge_exec 跑 docs:check）可选清理，但非必须——它是独立逻辑，不与 RTK 耦合。本 spec 保留，避免 scope creep。

### D6: 文档定位调整——从"五层防御"到"安全 + 隔离"

- **问题描述**：`context-budget.md` 标题是"五层上下文防御体系"，删除 Layer 1（read_cached）后如何调整？
- **候选方案**：
  - A. 重新编号为"四层防御"。
  - B. 重新定位为"安全执行 + 内容隔离边界"，明确压缩职责移交 Headroom。
- **选择理由**：选 B。"五层防御"的叙事已经不准确——Layer 1（去重）删了，压缩职责（Layer 5 的 forge_exec/git/read MCP 工具表）移交 Headroom。继续用"防御层"叙事会误导。改为"安全 + 隔离"定位，明确 Forge MCP 不再管压缩（那是 Headroom 的事），只管"执行什么命令安全"和"让什么内容进上下文"。这与实测结论一致：精简后 Forge MCP 与 Headroom 零功能重叠。
- **风险和缓解**：文档措辞变更可能让熟悉旧定位的用户困惑。缓解：保留"与 Headroom 的职责分工"对比表，清晰说明各自管什么。

## Design Reference Index

| Anchor | 位置 | 用途 |
|---|---|---|
| `design.md#d1-rtk-彻底删除不保留-opt-in` | D1 | RTK 彻底删，不留 opt-in |
| `design.md#d2-trimcommandoutput-保留作为-fallback` | D2 | trimmer 保留，Headroom 非强依赖 |
| `design.md#d3-forge_read_cached-彻底删除` | D3 | read_cached 删除，引导改 Grep |
| `design.md#d4-iron-law-双保险` | D4 | formatFailureOutput + Headroom protected 双保险 |
| `design.md#d5-安全层原样保留` | D5 | 安全层不重构，最小改动 |
| `design.md#d6-文档定位调整` | D6 | "五层防御"→"安全 + 隔离" |

## File Mapping

| 文件 | 动作 | 需求 |
|---|---|---|
| `src/mcp/trimmers/output.ts` | MODIFY（移除 isRtkAvailable/trimWithFallback/rtkCompress，保留 trimCommandOutput/formatFailureOutput） | 1 |
| `src/mcp/tools/forge-exec.ts` | MODIFY（移除 RTK import + 调用，保留安全层 + formatFailureOutput） | 1, 3 |
| `test/mcp/forge-exec-rtk.test.ts` | DELETE | 1 |
| `src/mcp/tools/forge-read-cached.ts` | DELETE | 2 |
| `src/mcp/read-cache.ts` | DELETE | 2 |
| `src/mcp/server.ts` | MODIFY（移除 registerForgeReadCached import + 调用） | 2 |
| `src/index.ts` | MODIFY（移除 read-cache 相关 barrel export） | 2 |
| `test/mcp/read-cache*.test.ts` | DELETE（若存在） | 2 |
| `skills/forge/lib/build/instructions.md` | MODIFY（forge_read_cached 引用改 Grep 引导） | 2 |
| `skills/forge/lib/review/instructions.md` | MODIFY（同上） | 2 |
| `skills/forge/lib/test/instructions.md` | MODIFY（同上） | 2 |
| `skills/forge/lib/build/references/context-budget.md` | MODIFY（定位调整 + 移除 read_cached + 压缩移交说明） | 5 |
| `scripts/init.sh` | MODIFY（拆分 Headroom/RTK 安装，移除 RTK） | 4 |
| `scripts/check-companions.mjs` | MODIFY（移除 RTK 检测项） | 4 |

## 非目标

- 不重构 forge_exec 安全层（D5）。
- 不改动 forge_git / forge_read / typed-capabilities 的功能（这些不与 Headroom 重叠）。
- 不把 Headroom 变成强依赖（D2）。
- 不重新实现压缩（Forge 不再自带压缩算法）。
- 不处理 Structured Output 被压风险（实测影响有限 + CCR 兜底，不折腾）。
