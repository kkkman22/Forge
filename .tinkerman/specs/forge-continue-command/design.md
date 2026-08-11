# /forge continue 交互式阶段推进命令 — 设计文档

## 概述

新增 `/forge continue` 子 skill,读取 `.tinkerman/status.md` 当前 phase/tier,调用已有的 `getNextPhase` + `buildNextForgeArgs` 生成下一个 `Skill(skill="forge", args="<phase>")` 调用。把 loop 路径(自主后台)已验证的推进逻辑接到交互式路径,顺带处置 `determineNextSkill` 死代码。

## 设计决策

### D1: continue 用 getNextPhase(方案 A),保留 determineNextSkill 为测试夹具

- **问题**:continue 用哪套推进逻辑?(见 Requirement 4)
- **候选方案**:
  - A. 用 `getNextPhase`(`phase-transitions.ts:124`,表驱动,运行时已验证)
  - B. 用 `determineNextSkill`(`skill-scheduler.ts:116`,13 状态机,更丰富但零生产调用)
- **选择**:**A**
- **理由**:`getNextPhase` + `advanceLoopAfterPhaseSuccess` + `buildNextForgeArgs` 已在 `/forge loop` 生产路径运行,有真实回归保障;`determineNextSkill` 虽含 debug/refactor/fix 分支,但 continue 的核心价值是"按当前 tier 序列推进",debug/refactor 是由其他命令(三击触发)负责的分支,continue 不应揽这些;用 A 风险最低。
- **determineNextSkill 处置**:不删,加注释说明"非生产路径,仅服务 property test 不变量守护";其 property test(`test/skill-scheduler.property.test.ts`)继续保留,因为它守护转换图的数学不变量,与生产消费者无关。
- **风险与缓解**:未来若 continue 需要更丰富的分支(debug 后回到哪),再评估迁移到 B——渐进演进,不在本 spec 扩 scope。

### D2: continue 是 inline dispatch,不是 fork

- **问题**:continue 的 dispatch_mode 选 fork 还是 inline?
- **选择**:**inline**
- **理由**:continue 是轻量 glue(读 status → 算下一 phase → 触发 Skill 调用),无独立重计算,无需 spawn fresh subagent;inline 让主 agent 直接执行,延迟更低,符合"快速推进"的用户预期;对比 status/resume 也是 inline。
- **风险与缓解**:inline 意味着 continue 复用主 agent 上下文——若主 agent 上下文已污染,continue 的判断可能受影响;但 continue 只读 status.md 客观字段,不依赖对话历史,风险可控。

### D3: 门控语义——review/test 无结果时拒绝推进并引导

- **问题**:continue 是否强制执行 §2.7 铁律(review/test 必须有 pass 结果才推进)?
- **选择**:**是,这是 continue 的核心增量价值**
- **理由**:`getNextPhase` 在 review 无 reviewResult 时本就抛异常(`phase-transitions.ts:131-136`);continue 把异常转化为用户可读引导("请先运行 /forge review"),而非中断会话;这把 §2.7 铁律从"靠 skill 自觉"升级为"程序化强制",是与 loop 路径对齐的语义。
- **失败处理**:review/test 结果是 fail(P1/P0 阻断)时,continue 路由回 build(对齐 `workflow-graph.ts` 的 `review→build` recovery loop,`allowRecoveryLoop:true`),而非前进到 ship。
- **风险与缓解**:用户可能觉得"被拒绝"烦人——但这是铁律,拒绝即正确行为;引导语明确告诉用户下一步做什么,体验可接受。

### D4: continue 不取代 loop,两者并存

- **问题**:有了 continue,loop 是否冗余?
- **选择**:**并存,语义不同**
- **理由**:loop 是无人值守后台自主模式(批量推进直到终止条件),continue 是交互式逐步推进(用户每次敲一下走一步);loop 适合"我信任它自己跑",continue 适合"我想每步看看";Trellis 也是 continue(finish-work)+ 自主模式并存。
- **风险与缓解**:两者共用 getNextPhase,逻辑一致,不会分叉。

## 接口设计

### continue skill 指令(`skills/forge/lib/continue/instructions.md`)

伪逻辑:
```
1. status = readTaskStatus()  // src/status-manager.ts:54
2. if no active task → "无 active task,请用 /forge <描述> 或 /forge resume" → 退出
3. if status.phase in [completed, shipped] → "任务已完成" → 退出
4. nextPhase = getNextPhase(status.phase, status.tier, status.reviewResult)  // phase-transitions.ts:124
   - 若 review/test 无 pass 结果 → 拒绝,引导对应命令
   - 若 review/test fail → 路由回 build
5. args = buildNextForgeArgs(nextPhase, status)  // package-runtime.ts:159
6. Skill(skill="forge", args=args)
```

### 分发注册

- `skills/forge/registry.toml` 新增 `[continue]`(仿 `[resume]` :205)
- `src/forge-dispatcher/allowlist.ts` ALLOW_LIST 新增 `continue`
- `.agents/skills/source-command-forge/SKILL.md:16-36` 分发表新增 continue 精确匹配
- `.claude/commands/forge.md` 同步

## 数据模型

无 schema 变更。复用 `status.md` 现有字段(phase/tier/work_nature/current_package/review_result/testPassed)。

## 风险

| 风险 | 缓解 |
|------|------|
| 命令计数从 37→38,触发 SST/docs SSOT 校验 | 跑 `scripts/sync-command-registry.mjs` 同步全部派生文件;CI `--verify-count` 守护 |
| status.md 字段缺失(如 review_result 未写)导致 getNextPhase 抛异常 | continue 捕获异常转引导提示,不中断会话;同时暴露 status 写入不完整的潜在 bug |
| continue 与 loop 的推进语义分叉 | 两者共用 getNextPhase + buildNextForgeArgs,同一套转换逻辑 |
| 用户依赖 continue 后忘记各 phase 职责 | 文档明确:continue 只推进,各 phase 的实际工作仍由对应 sub-skill 执行 |
| determineNextSkill 保留可能误导未来维护者 | 在 skill-scheduler.ts:116 加醒目注释:"非生产路径,仅服务 property test;生产推进用 getNextPhase" |
