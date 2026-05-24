---
title: 'CI UltraReview — 操作手册'
category: reference
audience:
- maintainer
updated: '2026-05-12'
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# CI UltraReview — 操作手册

## 概述

Forge 集成 Claude Code `ultrareview` CLI，为每个 PR 自动生成 AI 评审报告。CI 通道与本地 `/forge review` 互补：

| 通道 | 触发方式 | 覆盖范围 |
|------|---------|---------|
| CI UltraReview | 每次 PR push 自动触发 | 广度扫描、覆盖度 |
| 本地 `/forge review` | 开发者手动触发 | 深度 spec/ADR 对齐 |

## 启用方式

### 1. 初始化时启用

运行 `scripts/init.sh`，在安全级别收集后会提示是否启用 CI AI 评审。

### 2. 手动启用

复制 workflow 文件到项目：

```bash
mkdir -p .github/workflows
cp templates/ultrareview.yml .github/workflows/ultrareview.yml
```

### 3. 配置 GitHub Secret

在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：

- **Name**: `ANTHROPIC_API_KEY`
- **Value**: 你的 Anthropic API Key

## 工作流程

```
PR push → GitHub Actions → ultrareview.yml
  ├── 安装 Claude Code
  ├── 运行 scripts/run-ci-ultrareview.sh <PR号>
  ├── 生成 .forge/reviews/<PR号>-ci.md
  ├── 上传为 workflow artifact
  └── 评论 PR（severity 摘要 + artifact 链接）
```

## 评审产物

CI 评审产物位于 `.forge/reviews/<PR号>-ci.md`，包含：

- **frontmatter**: source、pr_number、commit_sha、branch、severity_counts
- **Summary**: 评审概要
- **Findings**: 按 P0-P3 分组的发现列表
- **Raw JSON**: 原始 ultrareview 输出

## 严重度与阻断规则

| 级别 | 含义 | CI 行为 |
|------|------|--------|
| P0 | 阻塞发布 | workflow 失败，PR 评论标红 |
| P1 | 高影响 | 记录但不阻断 |
| P2 | 中影响 | 记录 |
| P3 | 低影响 | 记录 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|-------|------|
| `ANTHROPIC_API_KEY` | (必需) | Claude Code 认证密钥 |
| `CI_ULTRAREVIEW_STRICT` | `0` | 设为 `1` 时所有失败阻断 CI |
| `CI_ULTRAREVIEW_TIMEOUT` | `900` | ultrareview 超时秒数 |

## 禁用方式

删除 `.github/workflows/ultrareview.yml` 即可完全禁用。`ANTHROPIC_API_KEY` 未配置时 workflow 自动跳过（不失败）。

## STRICT 模式

默认 rate-limit / auth 失败不阻断 CI。设置 `CI_ULTRAREVIEW_STRICT=1` 升级为硬失败：

```yaml
env:
  CI_ULTRAREVIEW_STRICT: "1"
```

## 本地评审与 CI 交互

运行 `/forge review` 时，如果存在同 PR 的 CI 产物：

1. 自动读取 CI severity_counts
2. 匹配的 finding 标记 `[confirmed-by-ci]`
3. CI 产物只读，不会被本地评审修改

## 故障排除

| 问题 | 原因 | 解决 |
|------|------|------|
| workflow skipped | ANTHROPIC_API_KEY 未配置 | 添加 GitHub secret |
| exit code 2 | Claude Code 未安装 | 检查 install step |
| stub artifact | rate-limit / timeout | 检查 API 配额，或增大 TIMEOUT |
