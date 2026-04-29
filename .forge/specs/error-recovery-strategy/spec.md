---
status: locked
created: "2026-04-29"
source: ".kiro/specs/error-recovery-strategy"
---

# Spec: Error Recovery Strategy

> 来源: `.kiro/specs/error-recovery-strategy/`

## 概述

为 `/forge resume` 实现系统性错误恢复机制，通过 git log 扫描、未提交变更检测、状态交叉比对和中断点精确分类，实现会话中断后的自动状态恢复。

## 核心设计原则

- **纯函数优先**：所有核心逻辑为纯函数，不执行 I/O
- **优先级链**：恢复检查按固定优先级顺序执行
- **事务性保障**：commit → progress → phase 更新遵循检查点模式
- **用户确认**：所有修复操作需用户确认

## 文件影响

- 新增: `src/error-recovery.ts` (核心模块，纯函数)
- 新增: `test/error-recovery.property.test.ts` (属性测试 Properties 1-9)
- 新增: `test/error-recovery-classifier.property.test.ts` (属性测试 Properties 10-13)
- 新增: `test/error-recovery-report.property.test.ts` (属性测试 Properties 14-15)
- 新增: `test/error-recovery-roundtrip.property.test.ts` (属性测试 Properties 16-18)
- 新增: `test/error-recovery.test.ts` (单元测试)
- 修改: `src/index.ts` (barrel file 新增导出)
