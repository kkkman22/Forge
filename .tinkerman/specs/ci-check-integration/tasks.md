---
feature: ci-check-integration
layout: tasks
created: 2026-04-29
spec_ref: ".tinkerman/specs/ci-check-integration/requirements.md"
---

# Tasks

## Task 1: 修改 templates/config.md — 文档化优先级关系和回退链

- [x] 1.1 扩展 templates/config.md 的 "CI 检查命令" section，添加优先级规则表格（build/test/ship/TDD 四个场景）、回退链说明、配置示例
- [x] 1.2 确认 YAML frontmatter 中 `ci_check_command` 字段的注释说明清晰准确

## Task 2: 修改 skills/forge-build/SKILL.md — Final Validation 引用 ci_check_command

- [x] 2.1 修改 §3.2 标准路径步骤 4，将"运行全量测试确认无回归"替换为包含 ci_check_command 优先级逻辑的 Final Validation 指令（读取 config → 非空则执行 → 空则回退 verify_commands → 都空则 AI 自动检测 → P5 证据链报告）
- [x] 2.2 修改 §3.3 全量路径的全量测试步骤，添加与标准路径相同的 ci_check_command Final Validation 逻辑
- [x] 2.3 在"已知 AI 失败模式"章节末尾新增"失败模式 7：自行拼凑验证命令"，包含错误行为、为什么这是错的、正确做法三部分

## Task 3: 修改 skills/forge-test/SKILL.md — Layer 3 清单引用 ci_check_command

- [x] 3.1 在 Layer 3 的 7 项清单表格之前新增"CI 检查命令优先级"说明段落
- [x] 3.2 更新清单项 1-4 的验证方式列，增加 ci_check_command 场景的说明
- [x] 3.3 新增使用 ci_check_command 时的清单输出格式示例

## Task 4: 修改 skills/forge-ship/SKILL.md — Test 门禁验证 ci_check_command

- [x] 4.1 更新 §2 门禁检查表格中 Test 门禁的描述，增加 ci_check_command 验证逻辑
- [x] 4.2 在门禁证据格式之后新增"CI 命令一致性检查"段落，描述警告场景和输出格式

## Task 5: 修改 scripts/init.sh — 新增 CI check command 交互步骤

- [x] 5.1 在安全级别收集之后、配置确认输出之前，新增 CI check command 交互提示（含帮助说明）
- [x] 5.2 对 ci_check_cmd 输入应用 sanitize 函数
- [x] 5.3 在配置确认输出中增加 CI 检查命令显示
- [x] 5.4 在 config.md 生成的 YAML frontmatter 中写入 ci_check_command 字段
- [x] 5.5 当 ci_check_cmd 非空时，在 config.md body 中生成"CI 检查命令"说明段落

## Task 6: 向后兼容性验证

- [x] 6.1 审查所有 SKILL.md 修改，确认每处 ci_check_command 逻辑都有"为空或缺失时回退到现有行为"的分支
- [x] 6.2 确认 init.sh 中留空 CI check command 时 config.md 输出正确（ci_check_command 为空字符串，无 CI 检查命令 section）
