---
updated: 2026-08-11
---
# Function Contracts

## `detectGlossaryMiss(specText, glossary)`

- **参数**：
  - `specText` — 规格文档正文文本
  - `glossary` — `loadEnforcementGlossary(rootDir, fs)` 返回：扁平 `.forge/glossary.md`（主权源）合并 enabled pack glossary 术语（只读补充）。
- **返回**：未定义术语列表（可能为空数组）
- **用途**：在 Spec Lock 流程最后扫描规格文本中是否使用了未在术语表中定义的术语，提示用户在 learn 阶段回写补充
