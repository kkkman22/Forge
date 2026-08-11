# 激活 context-injection.ts 死代码骨架 — 任务清单

- [ ] 1. review subagent prompt 注入 context 清单
  - `src/review/subagent.ts:buildReviewSubagents`(:59-97)调用 `readContextEntries` 读 `.tinkerman/runs/<runId>/context.jsonl` + `mergeContextSources` 合并 plan frontmatter `context_files`
  - 注入文件路径列表(每项 path + reason),不含正文
  - 按角色渐进过滤(spec-check→requirements/design;quality→conventions;security→threat-model);未标记则全注入
  - quality-check/security-check 的空字符串 prompt(:72-83)改为"引导语 + context 清单"
  - context.jsonl 不存在时静默跳过
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. DecideContext 扩 contextFiles 字段
  - `src/decide/types.ts:11-14` 的 DecideContext 新增可选 `contextFiles?: string[]`
  - _Requirements: 2.1_

- [ ] 3. decide Round 1 prompt 注入 context
  - `src/decide/orchestration.ts:59-68` buildDecideRound1Subagents 在 contextFiles 非空时追加 "Relevant artifacts: <file list>"
  - 文件列表 ≤20 行,避免 4096 字符截断冲突
  - contextFiles 来源:plan frontmatter context_files 或 context.jsonl
  - _Requirements: 2.2, 2.3, 2.4_

- [ ] 4. build 阶段写入 context.jsonl
  - build skill(读 plan 后、spawn subagent 前)调用 `appendContextEntry` 把 plan frontmatter context_files 写入 `.tinkerman/runs/<runId>/context.jsonl`
  - 用现有 O_APPEND 并发语义,不引入锁
  - plan 无 context_files 时跳过
  - runId 来源确认并复用 `.tinkerman/runs/` 现有命名
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 5. plan frontmatter context_files 消费打通
  - `src/plan.ts` 或 plan 解析入口把 frontmatter context_files 作为 mergeContextSources 第一参数传入
  - 合并去重(plan 静态 + jsonl 动态)
  - _Requirements: 4.1, 4.2_

- [ ] 6. 回归测试
  - 现有 `test/context-injection.test.ts` 全部通过
  - 新增:context.jsonl 不存在时 review/decide 不报错
  - 新增:appendContextEntry/readContextEntries/mergeContextSources 各有 ≥1 生产调用方(grep 验证非零)
  - _Requirements: 验收标准_
