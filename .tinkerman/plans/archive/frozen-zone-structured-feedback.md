---
topic: "frozen-zone-structured-feedback"
status: "approved"
date: "2026-05-12"
spec_ref: ".kiro/specs/frozen-zone-structured-feedback"
format: "lightweight"
---

## Objective

将 Forge 的冻结区保护从 `exit 2` 硬阻断升级为结构化 JSON 反馈 middleware。PreToolUse hook 从退出码决策改为 JSON stdout 决策；新增 PostToolUse hook 作为 defence-in-depth 兜底；Zone_Registry 从 `.tinkerman/config.md` 动态解析；结构化审计日志写 `.tinkerman/runs/`。

**关键背景**：当前实现是 TypeScript（`src/check-frozen.ts` + `src/state.ts`），通过 bash wrapper 调用。本 spec 保留 TS 实现不变，新增纯 bash 结构化反馈层。现有 `hook-check-frozen.sh` 的 exit 1 模式保留为 legacy（`FORGE_STRUCTURED_FROZEN=0`），新 bash 脚本在 TS 检查之上包装 JSON 输出。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#architecture` | 执行链对比：exit 2 → 结构化 middleware |
| `design.md#zone_registry-resolution` | config.md 解析流程 → Zone_Registry 内存模型 |
| `design.md#component-1-zone_registry` | zone-registry.sh 导出函数接口：parse_zone_registry, classify_path, emit_frozen_diagnostic |
| `design.md#component-2-pretooluse-hook` | PreToolUse hook JSON decision 流程 |
| `design.md#component-3-posttooluse-hook` | PostToolUse hook updatedToolOutput 覆写流程 |
| `design.md#component-4-hooksjson` | hooks.json PreToolUse + PostToolUse 条目配置 |
| `design.md#component-5-audit-log` | Frozen_Events JSONL 格式与轮转 |
| `design.md#component-6-forge-status` | `/forge status` frozen-zone 活动摘要 |
| `design.md#data-models` | Frozen_Diagnostic JSON schema + Events JSONL schema |
| `design.md#error-handling` | config 缺失、jq 缺失、status 限定符超时等场景处理 |
| `design.md#testing-strategy` | shell 测试 + 集成测试 + contract test 扩展 + 手动 e2e |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `scripts/zone-registry.sh` | CREATE | Zone_Registry 共享函数库（parse_zone_registry, classify_path, emit_frozen_diagnostic, log_event） |
| `scripts/print-zone-registry.sh` | CREATE | 调试工具，输出 flat list of zone rules |
| `scripts/hook-check-frozen-structured.sh` | CREATE | PreToolUse 结构化 JSON 决策 hook（新脚本，不替换现有） |
| `scripts/hook-check-frozen-post.sh` | CREATE | PostToolUse defence-in-depth hook |
| `scripts/summarize-frozen-events.sh` | CREATE | frozen-zone 事件摘要脚本（供 `/forge status` 调用） |
| `scripts/hook-check-frozen.sh` | MODIFY | 增加结构化模式分支（FORGE_STRUCTURED_FROZEN=1 时委托新脚本） |
| `hooks/hooks.json` | MODIFY | PreToolUse 增加 `if` 过滤；新增 PostToolUse 条目 |
| `templates/config.md` | MODIFY | 增加 guarded 语法示例 + frozen rule 示例 + feature flag 说明 |
| `skills/forge-status/SKILL.md` | MODIFY | 末尾追加 frozen-zone 活动摘要指令 |
| `test/hook-check-frozen.test.sh` | CREATE | Shell 测试：每种 category、status 限定、config 缺失、guarded、feature flag |
| `test/hook-check-frozen.integration.test.ts` | CREATE | 集成测试：模拟 CC 环境跑完整 hook |
| `test/contract.test.ts` | MODIFY | 扩展：断言新脚本存在 + hooks.json 结构 |
| `.tinkerman/decisions/ADR-0001-frozen-structured-feedback.md` | CREATE | ADR：exit-code → JSON feedback 迁移 |
| `CHANGELOG.md` | MODIFY | [ADDED] 结构化 frozen-zone 反馈 |
| `README.md` | MODIFY | 安全与信任章节加一段 |

## Task Breakdown

### Task 1: Zone_Registry 共享函数库
- **Goal**: 实现 `scripts/zone-registry.sh`，导出 parse_zone_registry、classify_path、emit_frozen_diagnostic、log_event 四个函数，供 Pre/Post hook 和 summary 脚本共用
- **File**: `scripts/zone-registry.sh`
- **Design Reference**: `design.md#component-1-zone_registry` — 解析 config.md YAML frontmatter + body 的 HARD-GATE 块和受保护区章节，构建内存 Zone_Registry
- **Depends On**: (none)
- **Verify**: `bash -n scripts/zone-registry.sh && source scripts/zone-registry.sh && type parse_zone_registry`
- **Commit**: `feat(frozen): add zone-registry.sh shared functions`

### Task 2: Zone_Registry 调试工具
- **Goal**: 实现 `scripts/print-zone-registry.sh`，调用 zone-registry.sh 输出 flat list of `<path-glob> <category> <reason_code>` 行
- **File**: `scripts/print-zone-registry.sh`
- **Design Reference**: `design.md#component-1-zone_registry` — R4.4 CLI 调试输出
- **Depends On**: Task 1
- **Verify**: `bash scripts/print-zone-registry.sh | head -5`
- **Commit**: `feat(frozen): add print-zone-registry.sh debug tool`

### Task 3: PreToolUse 结构化 JSON hook
- **Goal**: 新增 `scripts/hook-check-frozen-structured.sh`，实现 JSON stdout 决策（deny → Frozen_Diagnostic + log_event；allow → exit 0）；修改 `scripts/hook-check-frozen.sh` 增加 FORGE_STRUCTURED_FROZEN 分支委托
- **File**: `scripts/hook-check-frozen-structured.sh`, `scripts/hook-check-frozen.sh`
- **Design Reference**: `design.md#component-2-pretooluse-hook` — 解析 stdin JSON、feature flag 检查、TOOL_NAME 分支（Write/Edit/MultiEdit + Bash handle_bash）、classify_path → deny JSON + log_event
- **Depends On**: Task 1
- **Verify**: `echo '{"tool_name":"Write","tool_input":{"file_path":".tinkerman/config.md"}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-structured.sh`
- **Commit**: `feat(frozen): structured JSON PreToolUse hook`

### Task 4: PostToolUse defence-in-depth hook
- **Goal**: 新增 `scripts/hook-check-frozen-post.sh`，对成功写入 frozen 路径的工具覆写输出为 breach warning
- **File**: `scripts/hook-check-frozen-post.sh`
- **Design Reference**: `design.md#component-3-posttooluse-hook` — 仅处理 tool_response.success=true 的 Write/Edit/MultiEdit，re-classify → updatedToolOutput + breach log
- **Depends On**: Task 1
- **Verify**: `echo '{"tool_name":"Write","tool_input":{"file_path":".tinkerman/config.md"},"tool_response":{"success":true}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-post.sh`
- **Commit**: `feat(frozen): PostToolUse defence-in-depth hook`

### Task 5: hooks.json 调整
- **Goal**: 修改 hooks/hooks.json，PreToolUse 增加 `if` 过滤器（.tinkerman/** 路径）；新增 PostToolUse 条目带 `if` 过滤；保持现有 hook 行为不变
- **File**: `hooks/hooks.json`
- **Design Reference**: `design.md#component-4-hooksjson` — PreToolUse Write|Edit + Bash frozen 条目加 `if` 过滤；新增 PostToolUse Write|Edit 条目
- **Depends On**: Task 3, Task 4
- **Verify**: `node -e "const h=require('./hooks/hooks.json'); console.log('PreToolUse entries:', h.hooks.PreToolUse.length, 'PostToolUse entries:', h.hooks.PostToolUse?.length || 0)"`
- **Commit**: `feat(frozen): update hooks.json with structured hooks and if-filter`

### Task 6: Frozen_Events 审计日志
- **Goal**: log_event 函数（在 zone-registry.sh 中）实现 JSONL 追加 + flock 并发保护 + 10MB 轮转 + retention 清理；OTEL emit（可选）
- **File**: `scripts/zone-registry.sh`（追加 log_event 实现）
- **Design Reference**: `design.md#component-5-audit-log` — 单行 JSON 追加到 `.tinkerman/runs/<YYYY-MM-DD>-frozen-events.jsonl`，10MB 轮转，findings_retention_days 过期
- **Depends On**: Task 1
- **Verify**: `source scripts/zone-registry.sh && log_event "pre" ".tinkerman/config.md" "frozen-config" "CONFIG_ROOT" "denied" && cat .tinkerman/runs/*-frozen-events.jsonl | tail -1`
- **Commit**: `feat(frozen): audit logging with JSONL, rotation, and retention`

### Task 7: Config 模板更新
- **Goal**: 更新 `templates/config.md`，在受保护区章节加 guarded 语法示例、加一条注释自定义 frozen 规则示例、说明 FORGE_STRUCTURED_FROZEN feature flag
- **File**: `templates/config.md`
- **Design Reference**: `design.md#zone_registry-resolution` — R6.1-R6.4 config.md 模板更新
- **Depends On**: (none, 可与 Task 1-6 并行)
- **Verify**: `grep -c "FORGE_STRUCTURED_FROZEN" templates/config.md`
- **Commit**: `docs(frozen): update config template with guarded examples and feature flag`

### Task 8: `/forge status` frozen-zone 摘要
- **Goal**: 新增 `scripts/summarize-frozen-events.sh`；修改 `skills/forge-status/SKILL.md` 末尾追加 frozen-zone 活动摘要指令
- **File**: `scripts/summarize-frozen-events.sh`, `skills/forge-status/SKILL.md`
- **Design Reference**: `design.md#component-6-forge-status` — 按 category 聚合最近 N 天事件计数，简洁 Markdown 输出
- **Depends On**: Task 6
- **Verify**: `bash scripts/summarize-frozen-events.sh --days=7`
- **Commit**: `feat(frozen): add frozen-zone summary to /forge status`

### Task 9: Shell 测试套件
- **Goal**: 新增 `test/hook-check-frozen.test.sh`，覆盖每种 category deny、path 多 category 匹配、status 限定符（locked vs draft）、config 缺失降级、guarded append 允许/覆写拒绝、feature flag 双路径（=0/=1）
- **File**: `test/hook-check-frozen.test.sh`
- **Design Reference**: `design.md#testing-strategy` — shell 测试用 mock stdin JSON 喂给脚本
- **Depends On**: Task 1, Task 3, Task 4
- **Verify**: `bash test/hook-check-frozen.test.sh`
- **Commit**: `test(frozen): add shell test suite for frozen-zone hooks`

### Task 10: 集成测试 + Contract 测试扩展
- **Goal**: 新增 `test/hook-check-frozen.integration.test.ts` 模拟 CC 环境跑完整 hook；扩展 `test/contract.test.ts` 断言新脚本存在 + hooks.json 结构 + config.md HARD-GATE 块
- **File**: `test/hook-check-frozen.integration.test.ts`, `test/contract.test.ts`
- **Design Reference**: `design.md#testing-strategy` — 集成测试 + contract test 扩展
- **Depends On**: Task 3, Task 4, Task 5
- **Verify**: `npx vitest run test/hook-check-frozen.integration.test.ts test/contract.test.ts`
- **Commit**: `test(frozen): integration and contract tests for structured hooks`

### Task 11: Property 测试
- **Goal**: 随机路径字符串 classify_path 不崩溃（property-based）
- **File**: `test/hook-check-frozen.property.test.sh`（或在现有 property test 文件中追加）
- **Design Reference**: `design.md#testing-strategy` — R8.4 property test
- **Depends On**: Task 1
- **Verify**: `bash test/hook-check-frozen.property.test.sh`
- **Commit**: `test(frozen): property test for classify_path robustness`

### Task 12: 文档与 ADR
- **Goal**: 起草 ADR-0001 记录迁移决策；更新 CHANGELOG.md [ADDED]；更新 README.md 安全与信任章节；更新 SECURITY.md 威胁模型
- **File**: `.tinkerman/decisions/ADR-0001-frozen-structured-feedback.md`, `CHANGELOG.md`, `README.md`, `SECURITY.md`
- **Design Reference**: `design.md#testing-strategy` — R9.1-R9.5 文档要求
- **Depends On**: Task 5（需要最终 hooks.json 确认）
- **Verify**: `test -f .tinkerman/decisions/ADR-0001-frozen-structured-feedback.md && grep -c "structured" CHANGELOG.md`
- **Commit**: `docs(frozen): ADR-0001, CHANGELOG, README, SECURITY updates`

### Task 13: 全量验证
- **Goal**: `npm run check` 全量通过（tsc + biome + vitest + check-readme-metrics）
- **File**: (none，验证步骤)
- **Design Reference**: `design.md#testing-strategy` — R8.6 npm run check 全量通过
- **Depends On**: Task 9, Task 10, Task 11
- **Verify**: `npm run check`
- **Commit**: (no separate commit)

### Task 14: 手动端到端验证
- **Goal**: 在 Forge repo 设置 FORGE_STRUCTURED_FROZEN=1，尝试改 locked spec 确认诊断输出；Bash 绕过确认 PostTool 捕获；=0 验证 legacy 路径
- **File**: (none，手动验证步骤)
- **Design Reference**: `design.md#testing-strategy` — R10.1-R10.6 手动 e2e
- **Depends On**: Task 13
- **Verify**: (manual — 记录到 progress)

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1: Frozen_Diagnostic 对象定义 | Task 1 (emit_frozen_diagnostic) |
| R2: PreToolUse 结构化 JSON | Task 3 |
| R3: PostToolUse 覆写输出 | Task 4 |
| R4: Zone_Registry 从 config.md 读取 | Task 1, Task 2 |
| R5: Guarded_Zone 差异化处理 | Task 3 (guarded_append_check) |
| R6: 可观测性与审计 | Task 6, Task 8 |
| R7: 向后兼容与迁移 | Task 3 (feature flag), Task 9 (双路径测试) |
| R8: 测试与文档 | Task 9, Task 10, Task 11, Task 12, Task 13, Task 14 |
