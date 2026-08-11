---
feature: plugin-data-persistence
layout: design
created: 2026-05-30
---

# Design Document: Plugin Data 持久化

## Overview

提取共用路径解析函数，将 Forge 的 3 个 hook 脚本的热缓存从临时/项目目录迁移到 `${CLAUDE_PLUGIN_DATA}` 持久化目录。

**变更范围**：
- 新增 `scripts/lib/plugin-data-path.mjs`（共用模块，~30 行）
- 修改 `scripts/inject-evolved-rules.mjs`（缓存路径迁移）
- 修改 `scripts/knowledge-hook-dispatch.mjs`（缓存路径迁移）
- 修改 `scripts/record-evolved-rule-violation.mjs`（违规记录路径迁移）

**不涉及**：`.forge/knowledge/` 源文件、`audit-log.js`（已使用）、SKILL 文档。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  scripts/lib/plugin-data-path.mjs        │
│  getPluginDataDir() → ${CLAUDE_PLUGIN_DATA}/forge/      │
│                        或 ~/.claude/plugins/data/forge/  │
└──────────────────────┬──────────────────────────────────┘
                       │ import
       ┌───────────────┼───────────────┐
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│inject-      │ │knowledge-   │ │record-      │
│evolved-     │ │hook-        │ │evolved-rule-│
│rules.mjs    │ │dispatch.mjs │ │violation.mjs│
│             │ │             │ │             │
│缓存: evolved│ │缓存: know-  │ │记录: rule-  │
│rules-cache  │ │ledge-cache  │ │violations   │
└─────────────┘ └─────────────┘ └─────────────┘
```

**设计决策**：

1. **共用模块而非 inline 重复**：3 个脚本都需要路径解析，提取为 `scripts/lib/` 下的共用 ESM 模块。
2. **优雅降级**：`CLAUDE_PLUGIN_DATA` 不可用时回退到 `~/.claude/plugins/data/forge/`，再不可用则内存缓存。
3. **mtime 比对而非 hash**：缓存有效性用源文件 mtime 判断，比 hash 计算更快，hook 场景下足够准确。

## Components and Interfaces

### Component 1: plugin-data-path.mjs

```js
// scripts/lib/plugin-data-path.mjs
export function getPluginDataDir() {
  // 优先 CLAUDE_PLUGIN_DATA，回退 ~/.claude/plugins/data/forge/
  // 自动 mkdir -p
  // 返回绝对路径
}

export function getCachePath(filename) {
  // 拼接 ${getPluginDataDir()}/${filename}
}
```

### Component 2: inject-evolved-rules.mjs 修改

**当前行为**：从 `.forge/knowledge/evolved-rules.md` 读取源文件，每次编译。

**新行为**：
1. 调用 `getCachePath('evolved-rules-cache.json')`
2. 检查缓存 mtime vs 源文件 mtime
3. 缓存有效 → 读取缓存
4. 缓存无效 → 重新编译 → 写入缓存

### Component 3: knowledge-hook-dispatch.mjs 修改

**当前行为**：从 `.forge/knowledge/` 读取源文件处理。

**新行为**：使用 `getCachePath('knowledge-cache.json')` 缓存处理结果。

### Component 4: record-evolved-rule-violation.mjs 修改

**当前行为**：违规记录存储位置不确定。

**新行为**：使用 `getCachePath('rule-violations.json')` 持久化。

## Data Models

### evolved-rules-cache.json

```json
{
  "sourceMtime": "2026-05-30T...",
  "sourceHash": "sha256:...",
  "compiledAt": "2026-05-30T...",
  "rules": [/* 编译后的规则数组 */]
}
```

### knowledge-cache.json

```json
{
  "projectRoot": "/path/to/project",
  "entries": [{
    "path": ".forge/knowledge/solutions/xxx.md",
    "mtime": "...",
    "processed": "/* 处理后的注入文本 */"
  }],
  "lastUpdated": "..."
}
```

### rule-violations.json

```json
{
  "violations": [{
    "ruleId": "no-commit-to-main",
    "count": 3,
    "lastAt": "2026-05-30T...",
    "sessions": ["session-id-1", "session-id-2"]
  }]
}
```

## Error Handling

| 场景 | 行为 |
|------|------|
| `CLAUDE_PLUGIN_DATA` 未设置 | 回退到 `~/.claude/plugins/data/forge/` |
| 回退路径不可写 | 退化为内存缓存，stderr 警告 |
| 缓存文件损坏（JSON parse 失败） | 删除缓存，重新编译 |
| 旧路径有数据但新路径不存在 | 首次运行自动迁移 |

## Testing Strategy

1. **单元测试**：`getPluginDataDir()` 各种环境变量组合
2. **单元测试**：缓存 mtime 比对逻辑
3. **集成测试**：运行 `inject-evolved-rules.mjs` 验证缓存读写
4. **回归验证**：`npm run check` 通过
