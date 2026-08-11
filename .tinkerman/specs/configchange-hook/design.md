---
feature: configchange-hook
layout: design
created: 2026-05-30
---

# Design Document: ConfigChange Hook

## Overview

为 Forge plugin 新增 `ConfigChange` hook，监听 `.tinkerman/config.md` 和 `.claude/settings.json` 的变化，通过 `additionalContext` 提示 Claude 重新读取配置。

**变更范围**：
- 新增 `scripts/config-changed-hook.mjs`（~50 行）
- 修改 `.claude-plugin/plugin.json`（新增 ConfigChange 事件注册）

**不涉及**：已有 hook 的行为、SKILL 文档、知识库系统。

## Architecture

```
┌─────────────────────────────────────────┐
│         Claude Code Runtime              │
│   检测到配置文件变化 → 触发 ConfigChange  │
└──────────────────┬──────────────────────┘
                   │
       ┌───────────▼────────────┐
       │ config-changed-hook.mjs │
       │  1. 读取 stdin（变化文件列表）│
       │  2. 匹配监听列表          │
       │  3. 输出 additionalContext│
       └────────────────────────┘
```

## Components and Interfaces

### Component 1: config-changed-hook.mjs

**接口**：
```
触发方式：Claude Code ConfigChange 事件
输入：环境变量或 stdin（Claude Code 传入变化文件信息）
输出：JSON 到 stdout（optional）
退出码：始终 0（fail-open）
```

**监听列表常量**：
```js
const WATCHED_FILES = [
  '.tinkerman/config.md',
  '.claude/settings.json',
];
```

**匹配逻辑**：
1. 从环境变量或 hook 输入中提取变化的文件路径
2. 检查路径是否匹配 `WATCHED_FILES` 中的任意一项（endsWith 匹配）
3. 匹配时输出对应的 `additionalContext` JSON
4. 不匹配时静默退出

### Component 2: plugin.json 注册

```json
"ConfigChange": [
  {
    "hooks": [
      {
        "type": "command",
        "args": ["node", "${CLAUDE_PLUGIN_ROOT}/scripts/config-changed-hook.mjs"],
        "timeout": 3
      }
    ]
  }
]
```

## Error Handling

| 场景 | 行为 |
|------|------|
| 脚本内部异常 | try/catch → exit 0，stderr 记录错误 |
| 输入无法解析 | 静默退出，不输出 |
| Node.js 不可用 | Claude Code 跳过该 hook（框架级行为） |

## Testing Strategy

1. **单元测试**：mock 输入，验证匹配逻辑和 JSON 输出格式
2. **手动验证**：修改 `.tinkerman/config.md` 后观察 hook 是否触发提示
3. **回归验证**：`npm run check` 通过
