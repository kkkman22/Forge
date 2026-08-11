# Evidence — R3: evolved-rules SessionStart 注入

**Date:** 2026-07-09
**Status:** PASS (logic regression automated; runtime trigger documented)

## 验证对象

`inject-evolved-rules.mjs` 在 ZCode SessionStart 下触发并把 `.tinkerman/knowledge/evolved-rules.md` 注入对话上下文。

## 回归覆盖（自动化，CI 可复跑）

`test/inject-evolved-rules.test.ts` — 11 tests，含本 P1 新增 2 条 ZCode 平台裁剪路径：

| 场景 | 断言 | 状态 |
|---|---|---|
| 文件不存在 → 静默 exit 0，stdout 零字节 | fail-open | ✅ |
| 文件存在 → additionalContext 非空含 Content 摘要 | 注入生效 | ✅ |
| subagent caller → 零注入 | 隔离 | ✅ |
| **ZCode 信号存在 → 输出 keys ⊆ {additionalContext}，无 hookSpecificOutput** | 平台裁剪 (T5) | ✅ |
| **无 ZCode 信号 (Claude) → hookSpecificOutput.reloadSkills 保留** | 双平台透明 | ✅ |

运行命令：`npx vitest run test/inject-evolved-rules.test.ts`

## ZCode SessionStart 触发路径（机制依据）

zcode-guide `diagnosing-hooks` SKILL §1（逐字）：
> **Plugin hooks**: each plugin's `hooks/hooks.json`. **When any plugin contributes a hook, the hook runner is enabled automatically.**

→ 插件 SessionStart hook 自动启用，**无需** `hooks.enabled:true`（那是工作区配置型 hook 的要求）。Forge 走插件分发，SessionStart hook 在插件安装即生效。

## 注入生效判据

`additionalContext` 被 ZCode 注入对话（zcode-guide `diagnosing-hooks` §2 Hook output）：
> `additionalContext` is injected into the conversation.

→ 回归脚本已断言 additionalContext 非空且含规则 Content，满足注入判据。

## 运行时实证（手动，待 ZCode 客户端复核）

逻辑正确性由回归脚本保证。真实 ZCode 客户端触发需在装了 forge 插件的 ZCode 会话里观察 SessionStart 注入文本含 `## Evolved Rules (content-only)`。本机前期实测（v2 §5.5）：`/tmp/zcode-ws-hook-test/fired.log` 有 SessionStart 记录。
