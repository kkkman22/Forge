# Ship 门禁加固 — 任务清单

- [x] 1. 定义门禁类型和纯函数签名（RED）
  - 定义 `GateResult` 类型：`{ gate, passed, reason, details }`
  - 定义 `checkReviewGate(reviewDir, latestCommitHash)` 签名
  - 定义 `checkTestGate(testResultsDir, configCICheck?)` 签名
  - 定义 `checkProgressGate(progressDir, featureName)` 签名
  - 编写门禁失败场景的测试（TDD RED）
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. 编写门禁通过场景的 Preservation 测试
  - 验证当前 ship 流程在无门禁时仍正常工作
  - 验证 ship_merge、ship_push_pr、ship_discard 效果不变
  - 测试应在未修改代码前通过
  - _Requirements: 验收标准 纯函数可独立测试_

- [x] 3. 实现 checkReviewGate（GREEN）
  - 扫描 `.forge/reviews/` 最新报告
  - 解析 P0/P1 issue 计数
  - 检查 p1-fixlist.json 中是否有未修复的 P1
  - 返回 GateResult
  - 确保 task 1 的测试通过
  - _Requirements: 1.1, 2.1_

- [x] 4. 实现 checkTestGate（GREEN）
  - 检查 `.forge/test-results/` 最近结果
  - 如果 config.md 有 `ci_check_command`，执行并检查结果
  - 返回 GateResult
  - _Requirements: 1.2_

- [x] 5. 实现 checkProgressGate（GREEN）
  - 读取 `.forge/progress/<feature>.md` 任务状态
  - 全 completed → passed
  - 有 in_progress → passed + 警告
  - 无 progress → passed + 警告（可能 lightweight 路径）
  - _Requirements: 1.3_

- [x] 6. 实现 P1 Fix Checklist 集成
  - 定义 fixlist JSON schema
  - `/forge review` 完成时自动生成 fixlist 到 `.forge/reviews/<run-id>-p1-fixlist.json`
  - checkReviewGate 读取 fixlist，通过 git log 搜索修复 commit
  - 匹配 `[fix P1]` 前缀的 commit 消息
  - 更新 fixlist 中的 fixCommit 字段
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 7. 补齐 Fallback Ladder 实现
  - 在 review SKILL 文档中完整记录 L0-L3 条件和触发逻辑
  - 确保 L3 时 ship 阻断
  - 确保 methodology 字段写入 review report
  - 添加 HARD-GATE 断言：主 agent 不在 L3 时顶替
  - 编写 L3 阻断的 E2E 测试
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 8. 实现门禁结果持久化
  - 门禁结果写入 `.forge/ship/<run-id>-gates.json`
  - 包含每道门禁的 passed/reason/details
  - 包含 allPassed 汇总和 skipGate 信息
  - _Requirements: 验收标准 门禁结果写入_

- [x] 9. 实现 --skip-gate 机制
  - 解析 `--skip-gate=<gate-name>` 参数
  - `--skip-gate=all` 需要 `--force` 确认
  - 交互模式下禁止 `--skip-gate=all`
  - 跳过时在 ship commit 消息中标注 `[skip-gate: <reason>]`
  - 跳过信息写入 gates.json
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 10. 集成到 /forge ship 流程
  - 更新 ship SKILL 文档，在 merge/push 前插入门禁检查
  - 门禁检查顺序：Review → Test → Progress
  - 任一阻断 → 输出原因并退出
  - 全部通过 → 继续现有 ship 效果
  - _Requirements: 1.1, 1.2, 1.3_
