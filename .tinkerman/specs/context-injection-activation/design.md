# 激活 context-injection.ts 死代码骨架 — 设计文档

## 概述

激活 `src/context-injection.ts` 的三个未接线导出函数(`appendContextEntry`/`readContextEntries`/`mergeContextSources`),把它们接入 review/decide subagent 的 prompt 构造与 build 阶段的运行时写入。不新建机制,统一用 Forge 已有的 `.tinkerman/runs/<runId>/context.jsonl` 路径约定。

## 设计决策

### D1: 统一用 context.jsonl,不引入 implement.jsonl/check.jsonl

- **问题**:沿用 Forge 的 `context.jsonl` 还是引入 Trellis 风格的双文件?
- **候选方案**:
  - A. 用已有 `context.jsonl`(单文件,`ContextEntry{file,reason,task}` 已定义)
  - B. 引入 `implement.jsonl`/`check.jsonl`(双文件,按阶段分)
- **选择**:**A**
- **理由**:`context-injection.ts` 已实现并发安全(O_APPEND)、防御性读取、静态+动态合并;引入 B 会与 plan frontmatter `context_files`(静态)+ `context.jsonl`(动态)形成三套并行机制,违反 Forge R12 evolved-rule("重命名 ≠ 合并");`ContextEntry.task` 字段已可区分任务,角色区分由 Requirement 1.3 的"渐进增强"处理(未标记则全注入)。
- **风险与缓解**:单文件无法按 review/decide 阶段物理隔离——靠 `task` 字段逻辑过滤;若未来真需物理隔离,再拆分不迟(渐进演进)。

### D2: 注入"文件路径清单"而非"文件内容"

- **问题**:注入文件清单还是文件正文?
- **选择**:**路径清单(每项 path + reason)**
- **理由**:`agents-dispatcher.ts:201` 的 4096 字符 prompt 硬截断决定了不能塞正文;路径清单让 subagent 用 Read 工具按需读取,这正是 Trellis 模式的正确形态,也恰好是 `context.jsonl` 已设计的形态;正文注入会撑爆 prompt 且无法按 agent 兴趣裁剪。
- **风险与缓解**:subagent 可能不读清单里的文件——由 prompt 引导语强制(如"Review against these artifacts: <list>. Read them before judging.")。

### D3: review 先接,decide 次之,build 写入最后

- **问题**:三个接入点的实现顺序?
- **选择**:**review subagent → decide subagent → build 写入**
- **理由**:review 的 quality-check/security-check prompt 是空字符串(`subagent.ts:72-83`),痛点最尖锐、收益最直接;decide 的 DecideContext 扩字段是低风险增量;build 写入 `appendContextEntry` 涉及 runId 来源与并发,放最后。三者独立,可分阶段交付。
- **风险与缓解**:若只接 review 不接 build,context.jsonl 可能为空——退化为现状(不破坏),且 plan frontmatter `context_files` 的静态来源经 `mergeContextSources` 仍可注入。

### D4: runId 来源复用现有 .tinkerman/runs/ 命名

- **问题**:context.jsonl 的 `<runId>` 从哪来?
- **选择**:**复用 `.tinkerman/runs/` 现有命名约定**(JSONL 事件流已用日期命名)
- **理由**:`.tinkerman/runs/` 已存在(`<YYYY-MM-DD>-*-events.jsonl`),不新造 run id 体系;context.jsonl 可用 `<runId>=<date>` 或与当前 task slug 关联。具体格式在 build 阶段实现时确认 `.tinkerman/runs/` 的实际命名规则。
- **风险与缓解**:若 runs 目录命名不稳定,context.jsonl 定位失败——`readContextEntries` 已是防御性读取(跳过坏行/不存在),退化安全。

## 接口设计

### `DecideContext` 扩展(`src/decide/types.ts`)

```typescript
// 现状(:11-14)
interface DecideContext {
  taskDescription: string;
  involvedFiles: string[];
}

// 扩展后
interface DecideContext {
  taskDescription: string;
  involvedFiles: string[];
  contextFiles?: string[];  // 新增:合并后的 spec/research 文件路径列表
}
```

### review subagent prompt 构造变更(`src/review/subagent.ts:59-97`)

- `buildReviewSubagents` 在拼 prompt 前调用 `readContextEntries` + `mergeContextSources(planContextFiles, jsonlEntries)`
- 按角色过滤(Requirement 1.3)后,把文件清单段落追加到 `DIFF_CONTEXT_PREAMBLE` 之后
- quality-check/security-check 的固定空字符串 prompt 改为 "引导语 + context 清单"

## 数据模型

无 schema 变更。`ContextEntry{file,reason,task}`(`context-injection.ts:25-32`)已定义且正确。`ContextFilesSchema`(`plan-file.ts:26`)已定义。

## 风险

| 风险 | 缓解 |
|------|------|
| context.jsonl 不存在时 review/decide 行为变化 | Requirement 1.5/2.x 明确:不存在时静默跳过,退化为现状;新增回归测试覆盖 |
| 按 Role 注入(Req 1.3)需 ContextEntry 带 role 字段,当前 schema 没有 | 渐进增强:未标记 role 时全部注入;未来若需精细分类再扩 schema(本 spec 不扩) |
| build 写入 context.jsonl 的并发竞态 | `appendContextEntry` 已用 O_APPEND 原子追加(`context-injection.ts:47-50`),无需锁 |
| runId 定位不稳定导致 read 失败 | `readContextEntries` 防御性读取已兜底;且 plan frontmatter 静态来源不依赖 runId |
| 与 charter-build-grounding 的 subagent prompt 注入位置冲突 | 正交:charter 是常量摘要(固定段),context 是文件清单(动态列表),清单中并列两项 |
