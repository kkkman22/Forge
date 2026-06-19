# /forge continue 交互式阶段推进命令 — 任务清单

- [ ] 1. 创建 continue 子 skill 指令文档
  - 新建 `skills/forge/lib/continue/instructions.md`(dispatch_mode: inline)
  - 实现 continue 伪逻辑:readTaskStatus → 终态检查 → getNextPhase → buildNextForgeArgs → Skill 调用
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 2. 实现门控语义
  - review phase 无 pass 结果 → 拒绝,引导 `/forge review`
  - test phase 无 pass 结果 → 拒绝,引导 `/forge test`
  - review/test fail → 路由回 build(recovery loop)
  - 异常转用户可读提示,不中断会话
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3. 注册 continue 到分发链
  - `skills/forge/registry.toml` 新增 `[continue]` 块(仿 `[resume]` :205)
  - `src/forge-dispatcher/allowlist.ts` ALLOW_LIST 新增 continue
  - `.agents/skills/source-command-forge/SKILL.md:16-36` 分发表新增 continue 精确匹配
  - `.claude/commands/forge.md` 同步
  - 跑 `scripts/sync-command-registry.mjs` 同步 SSOT 派生文件
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 4. 处置 determineNextSkill 死代码
  - 在 `src/skill-scheduler.ts:116` determineNextSkill 上方加注释:"非生产路径,仅服务 property test;生产推进用 getNextPhase(phase-transitions.ts:124)"
  - 保留 `test/skill-scheduler.property.test.ts` 不动
  - 在 design.md 记录方案 A 决策理由
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 5. 文档同步
  - `docs/reference-commands.md` 新增 `/forge continue` 条目
  - `AGENTS.md` §2.7 实现说明补充 continue 是阶段推进的程序化入口
  - 评估 README.md 命令概览表是否新增条目
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 6. 回归测试
  - `/forge continue` 在 active task 时正确推进下一 phase
  - review 未通过时拒绝推进
  - 无 active task 时友好提示不报错
  - `/forge loop` 行为不受影响(共用 getNextPhase 验证)
  - _Requirements: 验收标准_
