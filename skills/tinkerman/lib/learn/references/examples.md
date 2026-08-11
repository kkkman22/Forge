---
updated: 2026-08-11
---
# Examples — Knowledge Sedimentation

> 从 `../instructions.md §11` 拆分。SKILL 主文件只保留一行摘要指针。

## 正常知识沉淀

```
$ /tinkerman learn

🧹 知识库维护... 15/20 ✅
📊 执行质量分析... 一次通过 4/5, 偏差 1.15
📈 指标更新... 写入 metrics.md
🔍 五维度提取...
  1. 问题：大数据量导出内存溢出
  2. 方案：流式处理 + 分片写入
  3. 踩坑：全量加载到内存 OOM
  4. 决策：流式优于分页（一致性）
  5. 可复用：>10000 条用流式
📝 输出：solutions/streaming-export-pattern.md (confidence: 0.7)
📊 "流式处理大数据量"已出现 3 次 → 写入 instincts.md (0.75)
✅ 知识沉淀完成：新增 1, 更新直觉 1, 当前 16/20
```

## 其他场景

- 高重叠时合并到已有文档（confidence +0.1，tags 合并）
- 知识库满时清理最低 confidence 文档
