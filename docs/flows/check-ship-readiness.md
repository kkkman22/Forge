---
title: 检查交付就绪任务流
category: getting-started
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← 返回索引](../INDEX.md) | [English Version](./check-ship-readiness.en.md)

# 检查交付就绪任务流

适用场景：代码已经完成，但你需要知道是否可以安全交付。

## 你给 Forge 的输入

当前任务名、分支状态，或直接运行状态命令。

```text
/forge status
/forge replay <topic>
/forge ship
```

## Forge 会做什么

- status 显示当前 task、phase、profile 和下一步。
- replay 回放当前 topic 的 stage 文件、ship 记录和 immutable evidence artifacts。
- doctor 展示更完整的健康快照。
- ship 检查 review/test/progress/artifact 等门禁。
- 如果证据过期或缺失，输出阻断原因和来源。

## 你需要决定什么

- 是否补跑缺失验证。
- 是否修复 review/test/ship gate 的 P0/P1 阻断。
- ship 阶段选择交付方式。

## 完成标准

- 下一步不再被 required gate 阻断。
- 所有 pass 声明都有最新命令或 artifact 支撑。
- 交付记录能追溯到 review/test/ship 证据。

## 证据链回放

当 status、doctor 或 ship 指出证据缺失、过期或互相矛盾时，运行：

```text
/forge replay <topic>
```

Replay 会只读地回放 stage 文件、ship records 和 `.forge/artifacts/index.jsonl`。输出会区分 `[fact]`、`[missing]` 和被取代但仍保留的 superseded artifacts。
