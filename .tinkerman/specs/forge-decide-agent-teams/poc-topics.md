# PoC Test Topics — Agent Teams vs DAG

> 用于 `scripts/run-decide-poc.sh <topic-id>` 的固定测试 topic（forge-decide-agent-teams R5.1）。
> 三个 topic 覆盖低/中/高三档复杂度，确保 PoC 对比有代表性。

---

## A: 添加一个新的 CLI flag

**复杂度**：低（单点改动，影响面小）

**需求描述**：给 `forge` CLI 增加一个 `--dry-run` flag，作用于 `/forge build`：解析 plan 与 task 但不执行任何写操作（不创建文件、不提交），仅打印"将要执行的步骤"清单。需要：
- 在 CLI 参数解析处识别 `--dry-run`
- 在 build 阶段入口拦截写操作（Write/Edit/Bash 写类）
- 输出拟执行步骤的有序清单（含 file mapping）
- 不破坏现有 build 行为（flag 缺省时行为不变）

**预期 ADR 决策点**：拦截层放哪（router vs build-skill）、如何区分"读"与"写"操作、dry-run 输出格式。

---

## B: 重构 config 系统

**复杂度**：中（跨多模块，需保持向后兼容）

**需求描述**：把 `.tinkerman/config.md` 的 flat YAML frontmatter 重构为分层结构（`[build]` / `[review]` / `[ship]` / `[loop]` section），同时：
- 保持所有现有字段（`tier`、`policy_profile`、`ci_check_command`、`build.use_goal` 等）的向后兼容
- 提供迁移脚本把旧 flat 格式自动转为新分层格式
- 更新 `src/config.ts` 的解析器支持两种格式（新格式优先，旧格式降级解析 + 一次性 warning）
- 更新 `templates/config.md` 模板为新格式
- 更新所有读取 config 的 skill instructions 引用新路径（如 `build.use_goal` → `[build] use_goal`）

**预期 ADR 决策点**：迁移策略（一次性 vs 渐进）、降级解析的 warning 强度、模板默认值。

---

## C: 引入 plugin 系统

**复杂度**：高（新架构，多决策维度，长期影响）

**需求描述**：为 Forge 设计一个第三方 plugin 系统，允许社区扩展 `/forge` 子命令。需要决策：
- plugin 发现机制（npm package naming convention vs 显式 registry vs 文件系统约定）
- plugin 沙箱（plugin 能调用哪些 Forge 内部 API、是否有权限模型）
- plugin 与现有 single-entry `/forge` dispatcher 的集成点（dispatcher_mode 是否新增 `plugin` 值）
- plugin 的生命周期（install / update / uninstall / 版本兼容性检查）
- 分发渠道（npm vs Forge marketplace vs git clone）
- 安全模型（plugin 能否执行任意 Bash、能否访问 `.tinkerman/` 状态）

**预期 ADR 决策点**：发现机制、沙箱边界、分发渠道、安全模型、版本兼容。

---

## 运行方式

```bash
# 对单个 topic 跑 DAG vs Teams 对比
bash scripts/run-decide-poc.sh A
bash scripts/run-decide-poc.sh B
bash scripts/run-decide-poc.sh C

# 汇总报告写入 .tinkerman/decisions/<date>-agent-teams-poc.md
```

每个 topic 采集的指标：token usage、wall-clock time、teammate failure count、final ADR word count、manual-review quality score。
