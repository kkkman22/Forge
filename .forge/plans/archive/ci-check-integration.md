---
topic: "ci-check-integration"
spec_ref: ".kiro/specs/ci-check-integration"
status: "approved"
created: "2026-04-29"
---

# Plan: CI Check Integration

## Objective

在 Forge 的 SKILL 文档和初始化脚本中集成 `ci_check_command`，确保 build 全量测试、test 验证清单和 ship 门禁检查统一使用项目配置的 CI 命令，消除 AI 自行拼凑命令的问题。

## Scope

- `templates/config.md` — 文档化优先级和回退链
- `skills/forge-build/SKILL.md` — Final Validation + 新增失败模式 7
- `skills/forge-test/SKILL.md` — Layer 3 清单引用 ci_check_command
- `skills/forge-ship/SKILL.md` — Test 门禁验证 ci_check_command
- `scripts/init.sh` — 新增 CI check command 交互步骤

**不涉及**：TypeScript 代码、测试代码、构建配置。

## Tasks

### Task 1: 修改 templates/config.md — 文档化优先级关系和回退链

- [ ] 1.1 扩展 "CI 检查命令" section，添加优先级规则表格（build/test/ship/TDD 四个场景）、回退链说明、配置示例
- [ ] 1.2 确认 YAML frontmatter 中 `ci_check_command` 字段的注释说明清晰准确

**Commit**: `docs(config): document ci_check_command priority rules and fallback chain`

### Task 2: 修改 skills/forge-build/SKILL.md — Final Validation 引用 ci_check_command

- [ ] 2.1 修改 §3.2 标准路径步骤 4，替换为包含 ci_check_command 优先级逻辑的 Final Validation 指令
- [ ] 2.2 修改 §3.3 全量路径的全量测试步骤，添加相同逻辑
- [ ] 2.3 在"已知 AI 失败模式"章节末尾新增"失败模式 7：自行拼凑验证命令"

**Commit**: `feat(build-skill): integrate ci_check_command into Final Validation and add failure mode 7`

### Task 3: 修改 skills/forge-test/SKILL.md — Layer 3 清单引用 ci_check_command

- [ ] 3.1 在 Layer 3 清单表格之前新增"CI 检查命令优先级"说明段落
- [ ] 3.2 更新清单项 1-4 的验证方式列
- [ ] 3.3 新增使用 ci_check_command 时的清单输出格式示例

**Commit**: `feat(test-skill): integrate ci_check_command into Layer 3 checklist`

### Task 4: 修改 skills/forge-ship/SKILL.md — Test 门禁验证 ci_check_command

- [ ] 4.1 更新 §2 门禁检查表格中 Test 门禁的描述
- [ ] 4.2 在门禁证据格式之后新增"CI 命令一致性检查"段落

**Commit**: `feat(ship-skill): add ci_check_command verification to Test gate`

### Task 5: 修改 scripts/init.sh — 新增 CI check command 交互步骤

- [ ] 5.1 在安全级别收集之后、配置确认输出之前，新增交互提示
- [ ] 5.2 对 ci_check_cmd 输入应用 sanitize 函数
- [ ] 5.3 在配置确认输出中增加 CI 检查命令显示
- [ ] 5.4 在 config.md 生成的 YAML frontmatter 中写入 ci_check_command 字段
- [ ] 5.5 当 ci_check_cmd 非空时，在 config.md body 中生成"CI 检查命令"说明段落

**Commit**: `feat(init): add ci_check_command interactive prompt to init script`

### Task 6: 向后兼容性验证

- [ ] 6.1 审查所有 SKILL.md 修改，确认 ci_check_command 为空时有正确回退
- [ ] 6.2 确认 init.sh 留空时 config.md 输出正确

**Commit**: 无独立 commit（验证性任务）

## Notes

- TDD 不适用：本功能仅涉及 SKILL.md 文档修改和 init.sh 脚本修改
- 验证方式：文档审查 + init.sh 手动测试 + 向后兼容验证
- 所有变更都是 additive 的，gated behind `ci_check_command` 非空条件
