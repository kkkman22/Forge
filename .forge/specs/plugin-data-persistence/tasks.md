---
feature: plugin-data-persistence
layout: tasks
created: 2026-05-30
spec_ref: ".forge/specs/plugin-data-persistence/requirements.md"
---

# Tasks

## Task 1: 新增共用路径解析模块

- [ ] 1.1 新建 `scripts/lib/plugin-data-path.mjs`，导出 `getPluginDataDir()` 和 `getCachePath(filename)`
- [ ] 1.2 实现 `${CLAUDE_PLUGIN_DATA}/forge/` 优先路径
- [ ] 1.3 实现 `~/.claude/plugins/data/forge/` 回退路径
- [ ] 1.4 实现 `mkdirSync({ recursive: true })` 自动创建
- [ ] 1.5 实现不可写时返回 `null`（由调用方决定退化策略）

**Verify-By**: bash — `node -e "import('./scripts/lib/plugin-data-path.mjs').then(m => console.log(m.getPluginDataDir()))"`
**关联需求**: R1

## Task 2: inject-evolved-rules.mjs 缓存迁移

- [ ] 2.1 import `getCachePath` from `scripts/lib/plugin-data-path.mjs`
- [ ] 2.2 实现 mtime 比对逻辑：缓存 mtime vs 源文件 mtime
- [ ] 2.3 缓存有效时直接读取 `evolved-rules-cache.json`
- [ ] 2.4 缓存无效时重新编译，写入缓存（含 sourceMtime + compiledAt）
- [ ] 2.5 实现缓存文件损坏时的自动重建（JSON parse try/catch）

**Verify-By**: bash — 运行两次 `node scripts/inject-evolved-rules.mjs`，第二次命中缓存
**关联需求**: R2

## Task 3: knowledge-hook-dispatch.mjs 缓存迁移

- [ ] 3.1 import `getCachePath` from `scripts/lib/plugin-data-path.mjs`
- [ ] 3.2 将知识库处理结果缓存到 `knowledge-cache.json`
- [ ] 3.3 实现 mtime 比对：源文件 mtime vs 缓存 mtime
- [ ] 3.4 实现按项目路径的缓存分区

**Verify-By**: bash — 运行后检查 `${pluginDataDir}/knowledge-cache.json` 存在
**关联需求**: R3

## Task 4: record-evolved-rule-violation.mjs 迁移

- [ ] 4.1 import `getCachePath` from `scripts/lib/plugin-data-path.mjs`
- [ ] 4.2 将违规记录存储到 `rule-violations.json`
- [ ] 4.3 实现 session 级聚合逻辑

**Verify-By**: bash — 运行后检查 `${pluginDataDir}/rule-violations.json` 存在
**关联需求**: R4

## Task 5: 向后兼容与迁移

- [ ] 5.1 实现旧路径到新路径的自动迁移逻辑
- [ ] 5.2 迁移后旧文件保留不删除
- [ ] 5.3 `CLAUDE_PLUGIN_DATA` 不可用时退化内存缓存

**Verify-By**: manual — 清除新路径，保留旧缓存，运行脚本验证迁移
**关联需求**: R5

## Task 6: 回归验证

- [ ] 6.1 `npm run check` 通过
- [ ] 6.2 手动运行 `/forge learn` 验证知识库缓存写入
- [ ] 6.3 确认 `inject-evolved-rules.mjs` SessionStart hook 行为不变

**Verify-By**: bash + manual
**关联需求**: 全部
