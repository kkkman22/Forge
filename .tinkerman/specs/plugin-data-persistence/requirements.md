---
status: completed
feature: plugin-data-persistence
layout: requirements
created: 2026-05-30
tier: light
---
# Plugin Data 持久化 — 需求文档

## 引言

Claude Code 2.1.78 引入 `${CLAUDE_PLUGIN_DATA}` 环境变量，指向 plugin 级持久化数据目录。该目录在 plugin 更新时保留，适合存储缓存、用户偏好、运行时状态等非项目级数据。

Forge 当前将知识库热缓存（processed rules、evolved-rules 缓存等）存储在项目内 `.tinkerman/` 目录或临时目录。plugin 更新后这些缓存丢失，需要重新计算。`audit-log.js` 已使用 `process.env.CLAUDE_PLUGIN_DATA` 但作为回退模式，缺少统一的路径解析策略。

本特性提取共用路径解析函数，将 plugin 级缓存数据迁移到 `${CLAUDE_PLUGIN_DATA}`，确保 plugin 更新后缓存不丢失。

**来源**：Claude Code CHANGELOG §43 `${CLAUDE_PLUGIN_DATA}` 插件持久化数据 `[2.1.78]`。

## 术语

- **CLAUDE_PLUGIN_DATA**：Claude Code v2.1.78+ 提供的环境变量，指向 plugin 持久化数据目录。该目录在 plugin 更新时保留。
- **Plugin Data Dir**：优先 `${CLAUDE_PLUGIN_DATA}/forge/`，回退 `~/.claude/plugins/data/forge/`。
- **热缓存**：处理后用于 hook 注入的缓存版本（非 `.tinkerman/knowledge/` 中的源文件），如 evolved-rules 编译缓存。
- **源数据**：存储在 `.tinkerman/knowledge/` 中的项目级知识文件，不迁移。

## 需求

### Requirement 1: 共用路径解析函数

**User Story:** 作为 Forge 维护者，我希望所有脚本使用统一的路径解析函数获取 plugin data 目录，以避免路径不一致。

#### 验收标准

1. THE `scripts/lib/plugin-data-path.mjs` SHALL 导出 `getPluginDataDir()` 函数，返回 plugin data 根目录路径。
2. THE `getPluginDataDir()` SHALL 优先使用 `process.env.CLAUDE_PLUGIN_DATA`，拼接 `/forge` 子目录。
3. WHEN `CLAUDE_PLUGIN_DATA` 未设置，THE 函数 SHALL 回退到 `~/.claude/plugins/data/forge/`。
4. THE 函数 SHALL 在首次调用时自动创建目录（`mkdirSync recursive`）。
5. THE 函数 SHALL 返回绝对路径字符串。

### Requirement 2: evolved-rules 缓存迁移

**User Story:** 作为 Forge 用户，我希望 evolved-rules 缓存在 plugin 更新后不丢失，以避免每次更新后重新编译规则。

#### 验收标准

1. THE `scripts/inject-evolved-rules.mjs` SHALL 使用 `getPluginDataDir()` 存储编译后的规则缓存。
2. THE 缓存文件路径 SHALL 为 `${pluginDataDir}/evolved-rules-cache.json`。
3. WHEN 源文件（`.tinkerman/knowledge/evolved-rules.md`）的 mtime 比缓存文件新，THE script SHALL 重新编译并更新缓存。
4. WHEN 缓存有效（mtime 未变），THE script SHALL 直接读取缓存，跳过编译步骤。
5. THE 缓存文件 SHALL 包含：编译时间戳、源文件 hash、编译结果。

### Requirement 3: 知识库 hook 缓存迁移

**User Story:** 作为 Forge 用户，我希望知识库 hook 注入的缓存在 plugin 更新后保留。

#### 验收标准

1. THE `scripts/knowledge-hook-dispatch.mjs` SHALL 使用 `getPluginDataDir()` 存储知识库处理缓存。
2. THE 缓存文件路径 SHALL 为 `${pluginDataDir}/knowledge-cache.json`。
3. THE 缓存 SHALL 存储：已处理的知识条目索引、最后处理时间、按项目的缓存分区。

### Requirement 4: evolved-rules 违规记录迁移

**User Story:** 作为 Forge 用户，我希望 evolved-rules 违规统计数据跨 plugin 更新保留。

#### 验收标准

1. THE `scripts/record-evolved-rule-violation.mjs` SHALL 使用 `getPluginDataDir()` 存储违规记录。
2. THE 违规记录路径 SHALL 为 `${pluginDataDir}/rule-violations.json`。
3. THE 违规记录 SHALL 按 session 聚合，包含：规则 ID、违反次数、最后违反时间。

### Requirement 5: 向后兼容

**User Story:** 作为现有 Forge 用户，我希望迁移后旧缓存位置的数据不丢失。

#### 验收标准

1. WHEN 新路径不存在但旧路径有缓存文件，THE 脚本 SHALL 迁移旧数据到新路径。
2. THE 迁移 SHALL 在首次运行时自动执行，无需用户干预。
3. THE 迁移后旧缓存文件 SHALL 保留但不再使用。
4. WHEN `CLAUDE_PLUGIN_DATA` 不可用且回退路径也不可写，THE 脚本 SHALL 退化为内存缓存（不持久化），不报错。
