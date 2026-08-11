---
updated: 2026-08-11
---
# Import Mode — 外部规格导入细节

当开发者从产品经理处收到外部规格文档时，使用 `/tinkerman spec <path>` 将其转化为 Forge 格式。

## Applicable Scenarios

- 产品经理交付了独立的 spec 文档（Markdown、纯文本等格式）
- 开发者需要将外部 spec 纳入 Forge 工作流，享受 spec 门禁、review 对齐等保障
- 替代手动编写 Forge 格式 spec 的重复劳动

## Import Flow

1. 读取指定路径的规格文档
2. 提取需求/场景，转化为 Forge SpecDocument 格式
3. 复用现有五项自检（可测试性/边界清晰度/人类可读性/棕地兼容性/反漂移完整性），未通过则自动修正
4. 展示转化结果，用户确认或修改
5. 写入 `.forge/specs/<feature>/spec.md`，status: "locked"，frontmatter 中标注 `import_source` 原始文件路径

## Conversion Rules

| Target | Strategy |
|--------|----------|
| Purpose | Extract as "Purpose" section |
| Requirements | Decompose into independent items (ID + title each) |
| Scenarios | Convert to "When...Then..." format; narratives must be rewritten |
| Non-goals | Direct mapping; unclear text → infer + user confirmation |
| Anti-drift | Auto-generated from extracted requirements |
| Delta | Extract if original describes modifications |

## Quality Assurance

- No info loss：unmappable 条目进入 "pending confirmation" 列表
- No info addition：auto-generated content 标注来源
- Scenarios 必须可测试：模糊场景标记 flagged
- 移除实现细节（类名/函数名/技术栈）

## Frontmatter (Import Mode)

添加 `import_source: "<原始文件相对路径>"` 字段。原始文件保留原位。

## Integration

导入锁定后成为标准 `.forge/specs/<feature>/spec.md`，后续 plan/build/review 流程无区别。

## Edge Cases

| Condition | Output |
|------|------|
| 导入：文件不存在 | ⚠️ 检查路径 |
| 导入：无法提取需求 | ⚠️ 确认文档含功能需求 |
| 导入：含实现细节 | ℹ️ 转化时移除实现细节，原始文件不丢失 |
