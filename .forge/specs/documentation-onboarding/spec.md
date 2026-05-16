---
topic: "documentation-onboarding"
status: locked
contract_legacy: true
date: "2026-05-12"
source: ".kiro/specs/documentation-onboarding/"
requirements_count: 6
tasks_count: 11
---

# Spec: 新用户引导文档与 README 优化

## 需求概览

| # | 需求 | 关键验收标准 |
|---|------|-------------|
| R1 | 新用户快速入门指南 | 5 步完成安装到首次执行；3 种安装方式；3+ 故障排除；2 个端到端示例 |
| R2 | 分层用户引导路径 | 3 条独立路线（初次接触者/日常开发者/高级用户）；每条含实操练习 |
| R3 | README 结构优化 | 重组为 ~150 行；前 20 行含描述+卖点；拆分非核心内容到独立文档 |
| R4 | 常见工作流示例 | 4 个场景（bug 修复/新功能/复杂需求/会话恢复）；含失败恢复流程 |
| R5 | 文档导航与发现性 | docs/INDEX.md 统一索引；≤2 次点击可达；链接有效性检查 |
| R6 | 文档国际化基础 | 中文为主；核心文档提供英文版（.en.md 后缀）；翻译状态标记 |

## 设计要点

- 文档分层模型：L0 门面（README）→ L1 入门（quick-start）→ L2 引导（onboarding-*.md）→ L3 实操（workflow-*.md）→ L4 参考（reference-*.md）
- README 从 ~782 行精简到 ~150 行
- 新建文件：docs/quick-start.md, docs/onboarding-*.md, docs/workflow-*.md, docs/reference-*.md, docs/INDEX.md + 英文版本
- 验证脚本：scripts/check-doc-links.sh, scripts/check-doc-structure.sh
- 集成到 npm run check

## 完整需求与设计

- 需求详情：requirements.md
- 设计详情：design.md
- 任务拆解：tasks.md
