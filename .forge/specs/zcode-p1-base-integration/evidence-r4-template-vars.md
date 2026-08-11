# Evidence — R4: `${CLAUDE_*}` 模板变量展开

**Date:** 2026-07-09
**Status:** PASS (依据层确认；运行时实证待 ZCode 客户端)

## 验证对象

`${CLAUDE_PLUGIN_ROOT}` 与 `${CLAUDE_PROJECT_DIR}` 在 ZCode plugin hook 下原样展开 + 注入环境变量。

## 机制依据（zcode-guide 原文，逐字）

`diagnosing-hooks` SKILL §2（模板变量）：
> Template variables (expanded in the command and each argument, **and also injected as environment variables**): `${CLAUDE_PROJECT_DIR}` / `${ZCODE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`; and, **for plugin hooks only**, `${CLAUDE_PLUGIN_ROOT}` / `${ZCODE_PLUGIN_ROOT}` and the plugin data directory.

三点确认：
1. **ZCode 原样展开 `CLAUDE_*` 命名**（不只认 `ZCODE_*`）。
2. 不仅 command 字符串展开，**还作为环境变量注入**（`process.env.CLAUDE_PLUGIN_ROOT` 可读）。
3. 仅限 **plugin hooks**（非 plugin 的工作区配置型 hook 不注入 `${CLAUDE_PLUGIN_ROOT}`）。

## 对 Forge 的影响

Forge hook 命令普遍用 fallback chain：
```
node "${CLAUDE_PLUGIN_ROOT:-}/scripts/stop-additional-context.mjs" 2>/dev/null || node scripts/stop-additional-context.mjs 2>/dev/null || true
```
第一段 `${CLAUDE_PLUGIN_ROOT}` 被 ZCode 原样展开 → 命中插件 cache 路径 → 脚本执行。**零改动可用。**

## 本 P1 复用此结论的两处

1. **T5 平台探测**（`scripts/lib/zcode-platform.mjs`）：探测信号选 `ZCODE_*`（非 `CLAUDE_*`），因为 `CLAUDE_*` 在 ZCode plugin hook 下也注入，无法区分平台；`ZCODE_*` 仅 ZCode 注入。测试覆盖：`test/scripts/zcode-platform.test.ts`（15 tests pass）。
2. **T2 工作区配置 Stop hook**：`.zcode/config.json` 的 Stop 命令用 `${CLAUDE_PLUGIN_ROOT:-}/...` fallback chain，依赖此展开。

## 运行时实证（手动，需真实 ZCode）

变量展开是 ZCode host 行为，无法纯模拟。手动验证步骤：
1. 装 forge 插件到 ZCode
2. `/forge init --platform zcode` 生成 `.zcode/config.json`（含 `${CLAUDE_PLUGIN_ROOT}` Stop hook）
3. 会话 Stop 时观察是否注入 status.md 摘要（additionalContext）

展开成功判据：命令里 `${CLAUDE_PLUGIN_ROOT}` → `~/.zcode/cli/plugins/cache/forge-official/forge/3.9.0`（非字面 `${...}`、非空）。

## 前期实测佐证

v2 §6.2 复核：96 条 `file.stat FAIL` 日志中，ZCode host 按 SessionStart 注入上下文里的路径做探测性 stat —— 证明 host 在解析/展开 hook 上下文路径，间接印证模板变量处理活跃。
