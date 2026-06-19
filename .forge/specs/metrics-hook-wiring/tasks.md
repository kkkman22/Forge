# 接线 metrics 采集 hook — 任务清单

- [ ] 1. 确认 UserPromptSubmit hook 配置格式
  - 查 Claude Code hook 文档,确认 plugin.json 的 hooks 字段名/matcher/type/command
  - 参考 `hooks/hooks.json:3,17`(inject-evolved-rules)和 `.githooks/` 写法
  - 确认 prompt 内容如何传递给 hook(stdin / 环境变量)
  - _Requirements: 1.2_

- [ ] 2. plugin.json 注册 UserPromptSubmit hook
  - `.claude-plugin/plugin.json` 新增 hooks.UserPromptSubmit,调用 `scripts/metrics-recorder.mjs`
  - 确保非阻断(blockOnFailure: false 或脚本内兜底)
  - 用 ${CLAUDE_PLUGIN_ROOT} 定位脚本(确认变量支持)
  - _Requirements: 1.1, 1.3_

- [ ] 3. 验证 metrics-recorder.mjs 输出路径与 aggregate 兼容
  - 确认 `aggregate-metrics.mjs` 的输入路径假设
  - metrics-recorder 写入 `.forge/.metrics/<date>-commands.jsonl` 格式与 aggregate 读取一致
  - 只采 `/forge <sub>` 命令名,不存 prompt 全文(隐私)
  - _Requirements: 2.2, D3_

- [ ] 4. .gitignore 忽略 .forge/.metrics/
  - `.gitignore` 新增 `.forge/.metrics/`
  - _Requirements: 2.3_

- [ ] 5. metrics-recorder 幂等与性能保障
  - 顶层 try/catch,任何异常 → exit 0 + stderr 静默
  - `.forge/` 不存在时立即 exit 0(非 forge 项目跳过)
  - append-only O_APPEND 写入
  - 实测执行 < 100ms
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 6. 端到端验证
  - forge 项目提交 `/forge status` 后 `.forge/.metrics/` 出现数据
  - 非 forge 项目提交 prompt 不报错
  - aggregate-metrics.mjs 能读取并输出聚合
  - hook 失败时不阻断 prompt(模拟脚本错误验证)
  - _Requirements: 验收标准_
