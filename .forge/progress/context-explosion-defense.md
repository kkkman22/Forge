# context-explosion-defense — Build Progress

## Wave 1: Read 去重

- [ ] 1. forge_read_cached — 缓存索引数据结构 (RED)
- [ ] 2. forge_read_cached — git hash 与 diff 计算 (RED)
- [ ] 3. forge_read_cached — tool 注册与主逻辑 (GREEN)
- [ ] 4. 注册 forge_read_cached 到 MCP server
- [ ] 5. Read Dedup Iron Law 规则

## Wave 2: 阶段隔离与预算监控

- [ ] 6. track-read-budget.mjs (PostToolUse hook)
- [ ] 7. 注册 track-read-budget hook
- [ ] 8. Phase Boundary Gate 逻辑
- [ ] 9. inject-plan-context.mjs 增强

## Wave 3: Subagent 文件化返回

- [ ] 10. subagent 结果返回协议模板
- [ ] 11. spec-check.md — 结果返回协议
- [ ] 12. quality-check.md — 结果返回协议
- [ ] 13. security-check.md — 结果返回协议
- [ ] 14. /forge review 结果处理逻辑

## Wave 4: 文档更新与集成验证

- [ ] 15. 重写 context-budget.md
- [ ] 16. 更新 CLAUDE.md §6
- [ ] 17. 集成测试
