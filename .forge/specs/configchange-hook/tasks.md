---
feature: configchange-hook
layout: tasks
created: 2026-05-30
spec_ref: ".forge/specs/configchange-hook/requirements.md"
---

# Tasks

## Task 1: 新建 ConfigChange Hook 脚本

- [ ] 1.1 新建 `scripts/config-changed-hook.mjs`，包含 `WATCHED_FILES` 常量和匹配逻辑
- [ ] 1.2 实现从 hook 输入中提取变化文件路径的逻辑
- [ ] 1.3 实现 `additionalContext` JSON 输出（按匹配文件生成不同提示文本）
- [ ] 1.4 实现 fail-open 设计：顶层 try/catch，所有异常 exit 0
- [ ] 1.5 添加 `--help` 输出（遵循 §2.8 Scripts as Black Box 铁律）

**Verify-By**: bash — `node scripts/config-changed-hook.mjs --help` 输出使用说明
**关联需求**: R1, R3

## Task 2: 注册 ConfigChange Hook 到 plugin.json

- [ ] 2.1 在 `.claude-plugin/plugin.json` 的 `hooks` 中新增 `ConfigChange` 事件
- [ ] 2.2 使用 `args` 数组形式，timeout 3s
- [ ] 2.3 验证 JSON 格式正确（`node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"` 不报错）

**Verify-By**: bash — JSON 校验通过 + 手动修改 `.forge/config.md` 触发提示
**关联需求**: R2

## Task 3: 验证与回归测试

- [ ] 3.1 `npm run check` 通过
- [ ] 3.2 手动修改 `.forge/config.md`，确认 Claude Code 输出 `additionalContext` 提示
- [ ] 3.3 确认已有 hook（SessionStart、PreToolUse 等）行为不变

**Verify-By**: manual — 端到端验证
**关联需求**: R1, R2
