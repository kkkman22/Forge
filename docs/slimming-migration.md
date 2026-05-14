# Forge Slimming 迁移指南

> 本指南覆盖 `forge-slimming-plan` 中 T2 命令委托带来的变更，帮助你理解哪些命令被委托、如何适应、以及低版本 Claude Code 的 fallback 行为。

---

## 概述

Forge Slimming（T1+T2+T3）将 Forge 命令分为三类：

- **保留命令**：Forge 特有功能，不委托（如 `/forge plan`、`/forge build`）
- **委托命令**：基础层可委托给 Claude Code 官方 slash command
- **精简命令**：功能合并或移除（如 `/forge abort`）

委托不是"移除"——Forge 差异化上层逻辑仍然保留，只是基础层由 Native_Command 处理。

---

## 受影响命令

### /forge recap

| 项目 | 说明 |
|------|------|
| **变更内容** | 基础层（上下文压缩 + 状态获取）委托给 `/compact` + `/context` |
| **委托的 Native_Command** | `/compact`, `/context` |
| **最低推荐 Claude Code 版本** | 2.0+ |
| **低版本 Fallback** | 运行完整遗留 recap 行为（git log + sessions + progress 聚合） |
| **Deprecation_Notice 锁文件** | `.forge/.deprecation-notice/<session_id>/forge-recap.lock` |

**Forge 差异化上层**（standardPath 成功后仍执行）：
- 从 `.forge/status.md` 提取当前 Spec 阶段、frozen file 列表
- 从 `.forge/progress/` 提取未完成 progress 项
- 合并输出：Native_Command 结果 + Forge 结构化摘要

### /forge resume

| 项目 | 说明 |
|------|------|
| **变更内容** | 基础会话恢复委托给 `/resume` + Checkpointing |
| **委托的 Native_Command** | `/resume`, Checkpointing |
| **最低推荐 Claude Code 版本** | 2.0+ |
| **低版本 Fallback** | 遗留 resume 行为（从 `.forge/progress/` + `.forge/knowledge/sessions/` 恢复） |
| **Deprecation_Notice 锁文件** | `.forge/.deprecation-notice/<session_id>/forge-resume.lock` |

**Forge 差异化上层**：五问题结构化 prompt 与 `--from-pr` 逻辑保留在 Forge 层。

### /forge abort

| 项目 | 说明 |
|------|------|
| **变更内容** | 纯精简——移除冗余逻辑，无 Native_Command 委托 |
| **委托的 Native_Command** | 无 |
| **最低推荐 Claude Code 版本** | N/A |
| **低版本 Fallback** | 无 fallback（行为未改变） |

### /forge learn

| 项目 | 说明 |
|------|------|
| **变更内容** | 会话级快速记忆委托给 Auto_Memory |
| **委托的 Native_Command** | Auto_Memory（Claude Code 内置） |
| **最低推荐 Claude Code 版本** | 2.1.59+（Auto_Memory 引入版本） |
| **低版本 Fallback** | 完整遗留 learn 覆盖（包含 build commands、debugging notes 等已委托类别） |
| **Deprecation_Notice 锁文件** | `.forge/.deprecation-notice/<session_id>/forge-learn.lock` |

**forge-learn 保留的差异化范围**（不委托）：
- 跨项目 ADR 生成与同步
- 五维度结构化沉淀（event / decision / pattern / anti-pattern / rule）
- `--from-chats` 历史对话提取
- 规则蒸馏（Evolved Rules）
- 执行质量评估

### /forge review

| 项目 | 说明 |
|------|------|
| **变更内容** | 质量审查和安全审查可选委托给 `/code-review` 和 `/security-review` |
| **委托的 Native_Command** | `/code-review`（`--delegate-quality`）、`/security-review`（`--delegate-security`） |
| **最低推荐 Claude Code 版本** | 2.0+ |
| **低版本 Fallback** | Forge 内建 quality/security reviewer |
| **Deprecation_Notice 锁文件** | `.forge/.deprecation-notice/<session_id>/forge-review.lock` |

**Forge 差异化上层**：Spec Alignment Review（Layer 1）始终由 Forge 执行，不委托。

---

## Pack_Conditional_Skill 注册

### 为什么 `forge-mutate` 可能不在命令列表中

`forge-mutate` 是一个 Pack_Conditional_Skill——仅在对应的 pack 启用 `feature_flag` 时才会被注册到命令列表。

具体条件：
- `forge-mutate` 需要 `mutation_critical_modules` feature flag
- 该 flag 由 `pms` pack 提供
- 未启用 pms pack → `forge-mutate` 不出现在 `/forge` 命令列表中

### 如何通过 pack 启用

1. 确认 pack 目录存在：`packs/pms/`
2. 在项目配置中激活 pms pack（修改 `.forge/config.md` 或使用 `/forge pack enable pms`）
3. 重新运行命令生成：`node scripts/gen-plugin-commands.mjs`
4. `forge-mutate` 将出现在 `commands/` 目录中

---

## Deprecation_Notice 机制

### 如何检查锁文件

Deprecation_Notice 使用 per-session 去重。每个 session 的首次触发会创建锁文件：

```bash
# 查看当前 session 的 deprecation 锁
ls .forge/.deprecation-notice/*/

# 锁文件路径格式
.forge/.deprecation-notice/<session_id>/<command>.lock
```

### 锁文件生命周期

- **创建**：SessionStart → 命令首次在 legacy 路径触发 → `O_EXCL` 原子创建
- **内容**：0 字节（存在性即信号）
- **清理**：Stop hook 在 session 结束时清理
- **Fallback**：若 `.forge/` 不可写，使用 `/tmp/.forge-deprecation-<session_id>/`

---

## FAQ

**Q: 委托后 Forge 命令的行为会改变吗？**
A: 不会。委托只影响基础层执行路径。Forge 的差异化上层（结构化输出、Spec 对齐、知识沉淀等）不受影响。

**Q: 升级 Claude Code 版本后需要重新配置吗？**
A: 不需要。版本探测是自动的，检测到满足版本要求后自动切换到 standardPath。

**Q: 所有环境都需要升级吗？**
A: 不需要。低版本 Claude Code 会自动使用 legacy 路径，行为与 slimming 前一致。Deprecation_Notice 只在 legacy 路径首次触发时显示一次。

**Q: 如何确认当前使用的是哪个路径？**
A: 查看命令输出的执行路径标识。standardPath 会显示委托的 Native_Command 名称；legacyPath 会显示 Deprecation_Notice。
