# Review Agent Timeout 动态化 — 任务清单

- [ ] 1. 编写 resolveAgentTimeoutMs 纯函数 + 单测（RED）
  - 先写测试：3 Tier 解析、单 Tier 缺失回退、全缺失回退 15min、非法值回退、tier 未知回退 standard。
  - _Requirements: Req2 (AC 1,2,3,4)_

- [ ] 2. 实现 resolveAgentTimeoutMs（GREEN）
  - `agents-dispatcher.ts` 新增 `TIER_DEFAULT_TIMEOUT_MS` map + 纯函数，正则解析扁平 config 字段。
  - _Requirements: Req2 (AC 2,3,4), Req1 (AC 2)_

- [ ] 3. 扩展 DispatchOptions + dispatch 集成（RED→GREEN）
  - DispatchOptions 加 `tier?` / `configContent?`；dispatch 的 timeoutMs 默认值改为 `opts.timeoutMs ?? resolveAgentTimeoutMs(opts.tier, opts.configContent ?? "") ?? DEFAULT_AGENT_TIMEOUT_MS`。
  - 测试：opts 传 tier+config 时用解析值；opts.timeoutMs 显式时 override。
  - _Requirements: Req3 (AC 1,2,3)_

- [ ] 4. 向后兼容测试（RED→GREEN）
  - 现有 dispatch 测试在无 configContent 时验证仍用 15 min。
  - _Requirements: Req4 (AC 1,2)_

- [ ] 5. 同步 config 模板
  - `.forge/config.md` + `templates/config.md` 新增 `review.agent_timeout_minutes.{light,standard,full}` 字段及注释。
  - _Requirements: Req1 (AC 1,5)_

- [ ] 6. 验证（npm run check）
  - typecheck + biome + vitest + check-dist-sync 全绿；确认现有 dispatcher 测试无回归。
  - _Requirements: 验收标准（npm run check 全绿）_
