---
status: approved
feature: context-explosion-defense
layout: tasks
created: 2026-05-30
spec_ref: ".tinkerman/specs/context-explosion-defense/requirements.md"
---

# Context Explosion Defense — 任务清单

## Wave 1: Read 去重（ROI 最高）

- [ ] 1. 实现 forge_read_cached MCP tool — 缓存索引数据结构（RED）
  - 在 `src/mcp/` 中创建 `read-cache.ts`：定义 `ReadCacheIndex`、`CacheEntry` 类型
  - 实现 `createIndex(sessionId: string): ReadCacheIndex`
  - 实现 `lookup(index, path, startLine?, endLine?): CacheEntry | null`
  - 实现 `update(index, path, gitHash, contentHash, charCount, lineRange?): CacheEntry`
  - 编写单元测试：空索引查找→null、命中→返回 entry、更新后命中
  - 测试先于实现（TDD RED）
  - _Requirements: 1.2, 1.6, 1.7_

- [ ] 2. 实现 forge_read_cached MCP tool — git hash 与 diff 计算（RED）
  - 实现 `getFileHash(path: string): Promise<string>`：优先 `git hash-object`，fallback SHA-256
  - 实现 `getFileDiff(path: string, oldHash: string, newHash: string): Promise<string>`：`git diff <old> <new> -- <path>`
  - 处理 untracked 文件（无 git hash）的 fallback 逻辑
  - 编写单元测试：tracked file → git hash、untracked → SHA-256、hash 变化 → diff 输出
  - _Requirements: 1.3, 1.4, 1.5_

- [ ] 3. 实现 forge_read_cached MCP tool — tool 注册与主逻辑（GREEN）
  - 在 `src/mcp/tools/forge-read-cached.ts` 中注册 tool：`z.object({ path, start_line?, end_line? })`
  - 主逻辑：lookup → hit? → hash same? → cached msg : diff + update
  - 首次读取：全量返回 + update index
  - 持久化索引到 `${TMPDIR}/forge-read-cache-${sessionId}.json`
  - 确保所有 task 1-2 的测试通过
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 4. 注册 forge_read_cached 到 MCP server
  - 在 `src/mcp/server.ts` 中注册新 tool
  - 更新 `init.sh` 无需变更（已指向 server.ts 入口）
  - 手动验证：启动 MCP server → 调用 forge_read_cached → 首次返回完整 → 二次返回 cached
  - _Requirements: 1.1_

- [ ] 5. 编写 Read Dedup Iron Law 规则
  - 更新 `skills/forge/lib/build/instructions.md`：新增 "Read Dedup Iron Law" 段落
  - 规则内容：同一文件 Read ≤2 次，第 2 次起用 forge_read_cached 或 Grep
  - 更新 `skills/forge/lib/review/instructions.md`：同上
  - 更新 `skills/forge/lib/test/instructions.md`：同上
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

## Wave 2: 阶段隔离与预算监控

- [ ] 6. 实现 track-read-budget.mjs（PostToolUse hook）
  - 创建 `scripts/track-read-budget.mjs`
  - 读取 `$TOOL_INPUT_FILE` 获取 Read 返回结果的字符数
  - 维护 `${TMPDIR}/forge-read-budget-${CLAUDE_SESSION_ID}.json`
  - 阈值逻辑：>100KB → ⚠️ 警告，>150KB → ⛔ 强制建议
  - fail-open：所有错误 exit 0，不阻断工具调用
  - 编写单元测试
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 7. 注册 track-read-budget hook 到 hooks.json
  - 在 `hooks.json` 的 `PostToolUse` 中新增 matcher: `Read` 的 hook
  - 在 `hooks.json` 的 `SessionStart` 中新增预算重置（`rm -f ${TMPDIR}/forge-read-budget-*.json`）
  - 验证 hook 触发：Read 一个文件 → 检查 budget 文件被创建且累积正确
  - _Requirements: 6.1, 6.7_

- [ ] 8. 实现 Phase Boundary Gate 逻辑
  - 更新 `skills/forge/lib/build/instructions.md` 的 phase-advance 段落
  - 增加 context budget 检查：读取 `${TMPDIR}/forge-read-budget-*.json`
  - >100KB → 输出警告，建议 /clear + /forge resume
  - >150KB → 输出强制建议，停止执行
  - 更新 `skills/forge/lib/review/instructions.md`：review 完成后的 budget 检查
  - 更新 `skills/forge/lib/test/instructions.md`：test 完成后的 budget 检查
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 9. 增强 inject-plan-context.mjs 支持按阶段最小加载
  - 增加 `--phase <phase>` 参数
  - 定义按阶段过滤规则（见 design.md Layer 4 表格）
  - build 阶段：只注入未完成 task（已有 isActive 过滤）
  - review 阶段：只注入 AC 列表，不注入完整 spec body
  - test/ship 阶段：只注入 progress + 摘要
  - 增加 `--compact` 模式：只注入 task 标题
  - 编写单元测试
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

## Wave 3: Subagent 文件化返回

- [ ] 10. 定义 subagent 结果返回协议模板
  - 定义 800 chars 摘要格式：`status / findings / p0 / p1 / report_path`
  - 定义报告文件命名约定：`.tinkerman/reviews/<layer>-<YYYYMMDD-HHmmss>.md`
  - 编写模板文档，供 3 个 agent 定义引用
  - _Requirements: 4.1, 4.2, 4.5_

- [ ] 11. 更新 spec-check.md — 结果返回协议
  - 在 `.claude/agents/spec-check.md` 末尾追加 "结果返回协议（MANDATORY）" 段落
  - 指令：Write 完整报告到 `.tinkerman/reviews/spec-check-<timestamp>.md`
  - 指令：最终返回 ≤800 chars 摘要
  - 指令：禁止在最终返回中包含完整报告内容
  - _Requirements: 4.1, 4.2_

- [ ] 12. 更新 quality-check.md — 结果返回协议
  - 同 task 11，报告路径 `.tinkerman/reviews/quality-check-<timestamp>.md`
  - _Requirements: 4.1, 4.2_

- [ ] 13. 更新 security-check.md — 结果返回协议
  - 同 task 11，报告路径 `.tinkerman/reviews/security-check-<timestamp>.md`
  - _Requirements: 4.1, 4.2_

- [ ] 14. 更新 /forge review 结果处理逻辑
  - 在 `skills/forge/lib/review/instructions.md` 中更新 subagent 结果处理段落
  - 解析摘要（status / findings / p0 / p1 / report_path）
  - p0>0 或 p1>0 → Read report_path
  - p0=0 且 p1=0 → 不读取，仅基于摘要
  - 综合评审报告仍输出到 `.tinkerman/reviews/<timestamp>-combined.md`
  - _Requirements: 4.3, 4.4_

## Wave 4: 文档更新与集成验证

- [ ] 15. 重写 context-budget.md 为五层防御体系文档
  - 更新 `skills/forge/lib/build/references/context-budget.md`
  - 文档结构：Layer 1-5 概述 + 各层工具使用指引 + 阈值表 + 各阶段预算建议
  - 保留 forge_exec / forge_git / forge_read 指引作为 Layer 5 的精细化工具
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 16. 更新 CLAUDE.md §6 阶段间上下文管理
  - 更新 CLAUDE.md §6 Session Boundaries：从"建议"改为"强制预算阈值"
  - 引用 context-budget.md 作为详细指引
  - _Requirements: 3.5, 3.6_

- [ ] 17. 集成测试 — 全流程上下文预算验证
  - 模拟 build 阶段：读取 10 个文件 → 验证 cache 命中 → 验证 budget 追踪
  - 模拟 phase advance：触发 budget 阈值 → 验证警告输出
  - 模拟 subagent 返回：验证文件化返回 → 验证主 agent 不读取无 P0/P1 报告
  - 验证 `npm run check` 全部通过
  - _Requirements: 8.3, 8.4_

---

## 依赖关系

```
Wave 1: Task 1 → Task 2 → Task 3 → Task 4
                                → Task 5（可与 Task 4 并行）

Wave 2: Task 6 → Task 7
         Task 8（依赖 Task 7 的 budget 文件）
         Task 9（独立）

Wave 3: Task 10 → Task 11, 12, 13（并行）
                  Task 14（依赖 11-13）

Wave 4: Task 15, 16（依赖 Wave 1-3）
         Task 17（最后执行）
```

## 验证清单

- [ ] forge_read_cached MCP tool 注册并可调用
- [ ] 同一文件二次读取返回 cached 消息
- [ ] 文件修改后二次读取返回 diff
- [ ] Read Dedup Iron Law 出现在 build/review/test instructions
- [ ] track-read-budget hook 触发并正确累积
- [ ] >100KB 预警、>150KB 强制建议输出
- [ ] Phase Boundary Gate 在 instructions 中定义
- [ ] 3 个 review agent 包含结果返回协议
- [ ] /forge review 正确处理文件化返回
- [ ] inject-plan-context 支持 --phase 参数
- [ ] context-budget.md 更新为五层防御体系
- [ ] `npm run check` 全部通过
