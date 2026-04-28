---
updated: "2026-04-28"
---

# 已知失败模式

尚未记录失败模式。当 `/forge debug` 发现反复出现的失败时，会自动记录到此文件。

<!-- 格式示例：
### 模块导入路径在 monorepo 中解析失败

**模式**：使用相对路径导入跨 package 的模块时，tsc 通过但运行时报 MODULE_NOT_FOUND
**触发条件**：monorepo + TypeScript path aliases + vitest
**根因**：vitest 不读取 tsconfig paths，需要配置 vite resolve.alias
**解决方案**：在 vitest.config.ts 中添加 resolve.alias 映射
**首次发现**：2025-01-15
**出现次数**：3
**置信度**：0.8
-->
