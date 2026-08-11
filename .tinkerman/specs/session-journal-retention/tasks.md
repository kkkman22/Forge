# Session Journal Retention — 任务清单

- [ ] 1. 编写 prune-sessions.sh 骨架（help/dry-run/退出码）
  - 仿 `scripts/prune-event-logs.sh` 结构：`set -euo pipefail`、`# category: user-facing` frontmatter、`--help` / `--dry-run` 解析。
  - _Requirements: Req1 (AC 1, 4, 5, 6)_

- [ ] 2. 实现 config 读取（session_retention_days / session_keep_recent）
  - 复用 prune-event-logs.sh 的 grep+sed frontmatter 解析模式；缺失/非法时回退默认值（90 / 5）+ stderr warning。
  - _Requirements: Req2 (AC 1, 2), Req1 (AC 2)_

- [ ] 3. 实现保护集计算（mtime 最近 N + solutions 引用）
  - `ls -t` 取最近 N 条 basename；`grep -h '^source_session:' solutions/*.md` 取引用集；二者并集为保护集。
  - _Requirements: Req3 (AC 1, 2)_

- [ ] 4. 实现删除逻辑 + tool-health.md 摘要
  - 删除集 = 过期集 − 保护集；dry-run 标注 `[protected]`；摘要行追加到 `.tinkerman/knowledge/tool-health.md`。
  - _Requirements: Req1 (AC 3), Req3 (AC 3), Req4 (AC 2)_

- [ ] 5. prune-event-logs.sh 末尾串行调用
  - 清理完 runs/ + reviews/ 后调用 prune-sessions.sh，透传 `--dry-run`。
  - _Requirements: Req4 (AC 1)_

- [ ] 6. 同步 config 模板
  - `.tinkerman/config.md` 和 `templates/config.md` 新增 `session_retention_days` + `session_keep_recent` 字段及注释。
  - _Requirements: Req2 (AC 1, 3)_

- [ ] 7. 编写测试
  - `test/scripts/prune-sessions.test.*`：构造临时 .tinkerman/ 结构，覆盖过期删除、保护保留、config 回退、dry-run 一致性、--help 输出。
  - _Requirements: Req1-4 全部 AC_

- [ ] 8. 验证（npm run check）
  - 确认 typecheck + biome + vitest + validate-scripts-help + check-dist-sync 全绿。
  - _Requirements: 验收标准（npm run check 全绿）_
