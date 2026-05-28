# ADR: PostToolUse Warning Injection

**Date**: 2026-05-28
**Status**: decided
**Deciders**: Forge contributors

## Context

Forge 宪法定义了 frozen zone（AI 不可修改的文件）和 context boundary（模块间依赖边界），但违规检测仅在 PreToolUse hook 中做。PostToolUse `updatedToolOutput` 能在工具返回结果后注入警告，让模型在下一轮看到违规信息。

## Decision

创建 `scripts/postooluse-inject-warnings.mjs`，在 PostToolUse hook 中：
1. 检测 Edit/Write/MultiEdit 是否触及 frozen 文件（specs[status:locked]、plans[status:approved]、config.md）
2. 检测 context boundary 违规（复用 check-context-boundary.mjs 逻辑）
3. 通过 `hookSpecificOutput.updatedToolOutput` 在原结果前注入中文警告
4. 可通过 `postooluse_inject_warnings: off` 配置关闭

## Consequences

- 模型能立即看到违规反馈，而非等下一次 PreToolUse
- PostToolUse 永不阻断（exit 0），只追加警告信息
- 降级：配置关闭时行为与升级前一致
