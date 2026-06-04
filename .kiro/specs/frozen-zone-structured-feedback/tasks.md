# Tasks

## Task 1: Zone_Registry 共享脚本

- [x] 1.1 新增 `scripts/zone-registry.sh`，导出 `parse_zone_registry`、`classify_path`、`emit_frozen_diagnostic` 三个函数
- [x] 1.2 实现 `.forge/config.md` YAML frontmatter 解析（使用 awk 或 yq，避免重依赖）
- [x] 1.3 实现 `<HARD-GATE name="frozen-zone-protection">` 块的 body 解析
- [x] 1.4 实现"受保护区"章节解析，支持 `append-only`/`no-overwrite`/`no-delete` 修饰符
- [x] 1.5 实现 `status: approved`、`status: approved` 限定符的 spec frontmatter 读取（100ms cap）
- [x] 1.6 实现进程内缓存（env var ZONE_REGISTRY_CACHE_*），单会话多次调用只解析一次
- [x] 1.7 实现 `emit_frozen_diagnostic` 输出 JSON 对象（含 message_md 渲染）
- [x] 1.8 新增 `scripts/print-zone-registry.sh` 调试工具

## Task 2: PreToolUse hook 重写

- [x] 2.1 备份当前 `scripts/hook-check-frozen.sh` 到 `scripts/hook-check-frozen-legacy.sh`
- [x] 2.2 重写 `scripts/hook-check-frozen.sh` 使用结构化 JSON 决策
- [x] 2.3 实现 `FORGE_STRUCTURED_FROZEN=0` 降级到 legacy 路径
- [x] 2.4 实现 `TOOL_NAME` 分支：只对 Write/Edit/MultiEdit 处理 file_path；对 Bash 调用 handle_bash
- [x] 2.5 实现 `handle_bash`：扫描 tool_input 中的路径，按同逻辑处理
- [x] 2.6 实现 deny 分支的 JSON 输出 + log_event
- [x] 2.7 实现 guarded_append_check（对比 tool_input.content 与 on-disk content）
- [x] 2.8 脚本退出码规范：0（JSON 决策）、2（脚本灾难）

## Task 3: PostToolUse hook 新增

- [x] 3.1 新增 `scripts/hook-check-frozen-post.sh`
- [x] 3.2 实现只对 tool_response.success=true 的写工具处理
- [x] 3.3 实现 re-classify + 输出 `hookSpecificOutput.updatedToolOutput`
- [x] 3.4 实现 `.forge/runs/<date>-frozen-events.jsonl` 写入（outcome=breached）
- [x] 3.5 实现 CC 版本检查：<2.1.121 时 no-op + warning
- [x] 3.6 错误处理：log 写失败不阻断

## Task 4: hooks.json 调整

- [x] 4.1 修改 `hooks/hooks.json`，PreToolUse 增加 `if: "Write(.forge/**)|..."`
- [x] 4.2 新增 PostToolUse 条目，同样带 `if` 过滤
- [x] 4.3 清理重复的 PreToolUse 条目（若当前有多条重复 matcher）
- [x] 4.4 在 `hooks.json` 头部添加注释说明 feature flag

## Task 5: Frozen_Events 审计日志

- [x] 5.1 实现 `log_event` 辅助函数（在 zone-registry.sh 或独立 log.sh）
- [x] 5.2 实现单行 JSON 追加 + flock 保护并发写
- [x] 5.3 实现 10MB 轮转逻辑（rename + 新文件）
- [x] 5.4 `findings_retention_days` 过期文件清理（可重用现有 retention 脚本）
- [x] 5.5 若 OTEL env var 存在，emit `forge.frozen_zone.hit` event

## Task 6: templates/config.md 更新

- [x] 6.1 在 `templates/config.md` 的"受保护区"章节加 guarded 语法示例
- [x] 6.2 加一条 commented 自定义 frozen 规则示例
- [x] 6.3 说明 FORGE_STRUCTURED_FROZEN feature flag 的作用
- [x] 6.4 Contract test 确认 template 仍符合 existing schema

## Task 7: `/forge status` 集成

- [x] 7.1 新增 `scripts/summarize-frozen-events.sh --days=N`
- [x] 7.2 按 category 聚合最近 N 天的事件计数
- [x] 7.3 输出简洁 Markdown 格式
- [x] 7.4 修改 `skills/forge-status/SKILL.md`，在输出末尾调用 summarize 脚本
- [x] 7.5 SKILL 保持 ≤150 行，超行移到 reference.md

## Task 8: 测试

- [x] 8.1 新增 `test/hook-check-frozen.test.sh`，覆盖每种 category、status 限定、config 缺失、guarded append
- [x] 8.2 新增 `test/hook-check-frozen.integration.test.ts`：模拟 CC 环境，跑完整 hook
- [x] 8.3 扩展 `test/contract.test.ts`：断言新脚本存在 + hooks.json 结构 + config.md HARD-GATE 块
- [x] 8.4 Property test：随机路径字符串 classify_path 不崩溃
- [x] 8.5 Feature flag 双路径测试（`=0` / `=1`）
- [x] 8.6 `npm run check` 全量通过

## Task 9: 文档与 ADR

- [x] 9.1 `.forge/decisions/<date>-frozen-structured-feedback.md` ADR 起草
- [x] 9.2 ADR 记录：动机、替代方案、feature flag 放量计划
- [x] 9.3 `CHANGELOG.md` 新增 `[ADDED]` 条目，注明 CC 最低版本
- [x] 9.4 `README.md` "安全与信任" 章节加一段结构化反馈说明
- [x] 9.5 `SECURITY.md` 更新威胁模型（defence-in-depth + audit log）

## Task 10: 手动端到端验证

- [x] 10.1 在 Forge 自己的 repo 设置 `FORGE_STRUCTURED_FROZEN=1`，尝试 `/forge` 流程中改 locked spec，确认诊断输出
- [x] 10.2 故意绕过 PreTool（用 Bash `cat > .forge/config.md`），确认 PostTool 捕获并写 log
- [x] 10.3 临时改 `.forge/config.md` 新增自定义 frozen 规则，确认即时生效（不需要重启）
- [x] 10.4 `FORGE_STRUCTURED_FROZEN=0` 验证 legacy 路径
- [x] 10.5 用 CC <2.1.121 验证 PostTool no-op
- [x] 10.6 观察 7 天 log 体积和轮转

## Task 11: Flag 放量与清理（延后 6 个月）

- [x] 11.1 观察 6 个月 Feature flag 使用情况，无问题后准备移除
- [x] 11.2 移除 `FORGE_STRUCTURED_FROZEN=0` 分支代码
- [x] 11.3 删除 `scripts/hook-check-frozen-legacy.sh`
- [x] 11.4 CHANGELOG `[REMOVED]` 条目
- [x] 11.5 spec 归档到 `.forge/archive/`
