# Forge 项目架构审核报告

> 视角：技术架构师 + 高级开发
> 范围：63K 行 TS / 709 测试文件 / v3.9.0
> 方法：4 个并行探查 agent 深读 `src/`、`test/`、`security/`、`mcp/`、`.forge/`
> 日期：2026-06-26

---

## 一句话结论

**这是一个工程素养极高、但已显露"自举过载"症状的项目。** 核心防御与降级机制设计成熟（足以作为范本），但被状态机冗余、上帝对象、僵尸目录和零散的规格漂移所拖累。它正处在"框架精炼"和"概念膨胀"的岔路口。

> **数据复核说明**：本报告所有数字均已于 2026-06-26 对照代码库实测核验。配套的 `复核情况说明.md` 记录了修订痕迹。

---

## 一、值得肯定的设计（真功夫所在）

| 维度 | 亮点 | 证据 |
|------|------|------|
| **纵深安全** | `forge_exec` 三层防御：硬编码 allowlist + settings deny + shell 元字符检测，简单命令走 `execFile(args[])` 消除注入面 | `src/mcp/tools/forge-exec.ts:95-214` |
| **注入防御工程化** | 32 样本对抗语料库 + 确定性评估器（零 LLM 成本）+ bypass-rate 单调门控（回归即 CI 失败）| `security/adversarial-corpus/evaluate.ts:195` |
| **审计完整性** | HMAC 链式审计日志 + 运行时随机 secret（0600）+ 文件锁并发控制 | `src/forge-dispatcher/audit-log.ts:106` |
| **路径防护** | `resolve()+relative()+realpathSync()` 三重校验，覆盖符号链接逃逸 | `src/mcp/tools/path-validator.ts:31` |
| **降级框架** | L0 并行→L1 串行→L2 CI 证据→L3 阻断 ship，每级有 trace | `src/review/fallback.ts:56` |
| **文档治理模块** | 子目录拆分清晰（cli/frontmatter/ssot/reporter），最大文件仅 261 行 | `src/docs-governance/` |

**安全姿态评分：7.5/10**，破坏性命令护栏经历了 v1→v5 五轮硬化迭代，这是真实对抗驱动出来的成熟度。

---

## 二、架构级问题（应优先处理）

### P0-1 三重/四重状态机并存 —— 概念冗余

项目里有**四套做"状态转换"的东西，互不依赖**：

- `src/state-machine/` —— 通用 YAML 状态机引擎，**全代码库零引用**，名字最像核心调度器，实则孤岛
- `src/workflow-graph.ts` —— 硬编码阶段图（真正生产路径之一）
- `src/loop/phase-transitions.ts` —— 运行时推进器（真正生产路径）
- `src/skill-scheduler.ts:96` —— 13 状态调度器，**注释自承认是非生产路径**

> 命名误导 + 死代码。`state-machine/` 要么接入主流程，要么删除；`skill-scheduler` 的 13 状态机若不用就移除。

### P0-2 上帝对象 / 巨型文件

| 文件 | 行数 | 问题 |
|------|------|------|
| `src/accept-driver.ts` | 1219 / 40 函数 | 浏览器客户端+安全+裁决+SHA校验+截图红化 6 职责混在一起 |
| `src/plan.ts` | 1127 / 46 导出 | 验证+格式检测+轻量验证+任务图升级 |
| `src/router.ts` | 595 | 分类+四维信号+意图字典+注入扫描+假设生成，单文件承担路由全部职责 |

> `router.ts` 还用全局可变缓存 `_intentDictCache`（`router.ts:125`），并发 forge 命令存在竞态。

### P1-1 硬编码 `.forge/` 路径散布 103 文件

无集中常量，`.forge/` 路径字面量散布在 **103 个** `src/**/*.ts` 文件中，config.md 被多处独立正则解析。**这是状态契约脆弱的根源** —— 重命名一个目录要改上百处。

> （原稿曾称"frontmatter 解析在 ≥3 个模块各写一遍"，经核验**不成立**：存在集中模块 `src/frontmatter.ts`，`decide/adr.ts`、`status-manager.ts` 均通过 `import { parseFrontmatter }` 复用，并未重复实现。frontmatter 读取这一块已治理，本条仅 .forge 路径常量问题有效。）

### P1-2 降级 L2 语义验证薄弱

`tryParseCiEvidence()`（`fallback.ts:289`）只读历史报告的 `p0_count/p1_count`，**不校验该报告是否对应当前 diff**。历史报告被误用 → 错误放行 ship。且截断重试与 fallback 的 L1 在 trace 里无法区分，调试困难。

---

## 三、技术债 / YAGNI 信号

1. **僵尸目录**：`.kiro/`（828K，67 个 `_archived`）、`.codex/`（124K）是 Kiro→Codex→Claude Code 迁移残留，`.agents/` 仅 1 文件。可整体归档/删除。
2. **规格-实现漂移**：`.forge/specs/cursor-team-kit-integration/design.md`（1651 行）在 `src/` **找不到对应实现**（0 引用）。457 个 spec（含 147 个 design.md）与 1826 行知识库仍需逐项"实现验证"清理。

   > （原稿曾把 `cmux-integration/design.md`（2159 行）也列为漂移，经核验**不成立**：src/ 中有 10 个相关文件，如 `forge-dispatcher/cmux-gate.ts`、`harness-cmux-browser.ts`，cmux 已实际落地。漂移清单仅 cursor-team-kit 一项有效。）
   > （原稿"88K 行知识库"亦已修正：实测 `.forge/knowledge/` 为 1826 行 / 30 文件。）
3. **过度分层术语**：全历史 commit 里 L0-L8/四层/五层/六层等层级术语出现 **18 次**（如 `L7` bypass gate、`L8 foundation`、`六层 token` 等），术语在膨胀但量级可控。

   > （原稿曾称"`Methodology` 只是类型标签，无差异化实现"，经核验**不成立**：`src/pua-engine.ts:171` 的 `METHODOLOGY_DESCRIPTIONS` 为 Huawei 5-Why / Musk 5-Step / Amazon Backwards / ByteDance A/B / Alibaba Closure / Netflix Keeper / Baidu Search 等每种方法论都提供了完整 5-step prompt 实现，已有差异化内容。该项不再算技术债。）
4. **evolved-rules 过度元数据化**：每条规则 9 个字段，`Verified_via`/`Baseline_violation` 多数填 N/A，ROI 低。
5. **11 个 `@deprecated` 未清理**：`sandbox-policy.ts` 占 8 个，`forge-read.ts` 2 个，`check-sandbox.ts` 1 个。Phase1→Phase2 迁移悬而未决（且 Phase 1 沙箱是 advisory-only，无实际 enforcement）。

   > （原稿称 27 个，实测全 src/ 共 11 个。）

---

## 四、工程实践评价

**check 链（`scripts/check-*` 共 39 个校验脚本）**：核心三件套（`tsc` / `biome` / `vitest`）高价值；但 `check-readme-metrics`、`check-evolution-marker-zones`、`check-agent-originality` 属低 ROI 噪音，易过时、维护成本高于收益。

**测试**：709 测试文件 / 53 子目录，层次齐全（unit/e2e/contract/property/injection/architecture）。**fast-check 已落地**（`test/fix-checklist.property.test.ts`），但 **Stryker 装了依赖却无配置文件，mutation testing 形同虚设** —— 要么补 `stryker.conf`，要么从 devDeps 移除。

**dist/ 管理**：实际仅 **4 个** dist 产物入库（`git ls-files dist` = `forge-context.mjs` + `adversarial-corpus/evaluate.{d.ts,js,js.map}`），其余 dist 内容全在 `.gitignore`（`dist/src/`、`dist/scripts/`、`dist/test/`、`dist/claude-code/bundles/` 等）。入库的极小子集服务于 marketplace 安装（根 `.mcp.json → dist/forge-context.mjs`）。真正的问题是 sync 流程的**频率**——全历史 157 次 "sync derived data" 提交确实造成 commit log 噪音，可考虑改为发布时 CI 触发而非每次构建触发。

> （原稿曾称"dist/ 入库 3555 文件，导致 git 历史膨胀/PR diff 噪音/合并冲突"，经核验**不成立**：3555 是工作树文件数，git 仅跟踪 4 个。原"移出 git"建议前提缺失，已改为针对 sync 频率本身。）

---

## 五、给维护者的行动清单（按优先级）

| # | 动作 | 价值 |
|---|------|------|
| 1 | 删除 `state-machine/` 或 `skill-scheduler` 13 状态机 + 删 `.kiro/`/`.codex/` | 立即消除最大认知负担 |
| 2 | 拆 `accept-driver.ts` / `plan.ts` 为子目录模块 | 降低改动半径 |
| 3 | 抽 `.forge/` 路径常量（散布 103 文件）+ 统一 config 读取器 | 根治状态契约脆弱 |
| 4 | L2 证据加 diff 新鲜度校验；区分两种 L1 trace | 堵住 ship 误放行漏洞 |
| 5 | dist sync 改发布时 CI 触发（非每次构建）；裁剪低 ROI check + 删/配 Stryker | 减少 commit log 噪音与日常摩擦 |
| 6 | 审计 spec 库（457 个），未实现的（如 `cursor-team-kit-integration`）标 `draft` | 消除规格漂移 |

---

## 总评

**整体评分：架构 7/10，工程纪律 8/10，概念克制度 5/10。**

这是一个"少有人能做到这个完成度、但作者需要开始做减法"的项目。它最大的风险不是 bug，而是**自身复杂度的复利增长** —— 每加一"层"都在增加未来理解和维护的税。当前阶段最该写的不是新 feature，而是一次果断的架构瘦身。
