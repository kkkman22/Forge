---
updated: 2026-08-11
---
# Dependency Identification Rules

## 依赖判断规则

| 场景 | 依赖判断 |
|------|---------|
| 同文件不同函数 | 一般有依赖（除非完全独立的工具函数） |
| 跨文件 import | 有依赖 |
| 测试任务依赖被测代码任务 | 有依赖 |
| 文档/配置任务 | 通常无依赖 |
| 独立工具函数（无外部 import） | 无依赖 |

## 输出格式

每个任务的 `dependsOn` 字段必须显式填充（空数组 `[]` 表示无依赖），不得留 `undefined`。

## 与 Step 4 校验的关系

Step 4 使用 `toTaskGraph(tasks)` 将任务转换为 `TaskGraph`，然后调用 `validateGraph` 校验：
- 无重复 ID
- 所有依赖引用指向已存在任务
- 无循环（DAG 属性）

校验失败时自动修正（剔除循环/无效引用），修正后重新自检。
