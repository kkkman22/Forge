# Tasks

## Task 1: 定位当前归档实现

- [x] 1.1 确认当前归档入口文件（`scripts/archive-spec.sh` 或 `skills/forge-archive/SKILL.md` 或其他），记录在本 tasks 头部
- [x] 1.2 记录当前归档流程的步骤、调用点、测试覆盖情况
- [x] 1.3 如归档走 skill，确认 skill → 脚本的调用链；如只走 skill 无脚本，Task 2 要先抽出脚本

## Task 2: Archive_Driver 脚本改造

- [x] 2.1 在归档脚本中新增 `--purge-cc=ask|skip|auto` 参数解析
- [x] 2.2 实现 `resolve_project_path()`：处理 git worktree 场景（用 `git rev-parse --git-common-dir`）
- [x] 2.3 实现 `check_blacklist()`：拒绝 `/`, `$HOME`, `/tmp` 等路径
- [x] 2.4 实现 `cc_purge_preview()`：调 `claude project purge --dry-run`，捕获 stdout/exit
- [x] 2.5 实现 `cc_purge_execute()`：调 `claude project purge --yes`
- [x] 2.6 实现两次 prompt 流程（仅 `--purge-cc=ask`）
- [x] 2.7 实现 CC 版本检测（`claude --version` 解析 + `claude project purge --help` gate）
- [x] 2.8 错误分类：文件归档失败 exit 1，CC purge 失败 exit 2，参数错误 exit 3

## Task 3: Purge_Manifest 写入

- [x] 3.1 实现 `write_manifest()`：生成 `<archive-dir>/purge-manifest.json`
- [x] 3.2 dry-run 阶段先写 `user_decision: "pending"`，执行后更新
- [x] 3.3 stdout 截断至 10 KB + `truncated` flag
- [x] 3.4 Ctrl+C trap：写 `user_decision: "interrupted"` 后退出
- [x] 3.5 manifest 使用 POSIX `printf` 生成 JSON（避免依赖 `jq`），或统一用 `jq` 但在归档脚本开头 gate 检查

## Task 4: Skill 文档更新

- [x] 4.1 在归档相关 SKILL.md 中新增 "CC Transcripts 清理（可选）" 章节
- [x] 4.2 解释三种 `--purge-cc` 取值的语义和使用场景
- [x] 4.3 说明 CC 版本要求（≥2.1.126）和降级路径
- [x] 4.4 保持 SKILL ≤150 行约束

## Task 5: ADR 与 README

- [x] 5.1 在 `.forge/decisions/` 新增 ADR：`<date>-cc-purge-integration.md`
- [x] 5.2 ADR 记录：为什么集成 purge、为什么不自动执行、黑名单为什么必要、worktree 路径处理
- [x] 5.3 `README.md` 新增"归档与 CC transcripts 清理"子节
- [x] 5.4 `CHANGELOG.md` 新增 `[CHANGED]` 条目

## Task 6: 测试

- [x] 6.1 新增 `test/archive-purge.test.sh`，使用 mock claude 覆盖所有分支
- [x] 6.2 测试 user_decision 的所有取值路径
- [x] 6.3 测试 CC 版本过低 / claude 未安装 / 黑名单命中
- [x] 6.4 测试 manifest schema 符合预期
- [x] 6.5 契约测试：SKILL.md 含新章节关键字
- [x] 6.6 `npm run check` 通过

## Task 7: 端到端验证

- [x] 7.1 在 Forge 自己的 repo 归档一个已完成 spec，执行 `--purge-cc=ask` 走完流程
- [x] 7.2 验证 `~/.claude/projects/-Users-king-code-Forge/` 确实被清理
- [x] 7.3 验证 `~/.claude.json` 中该项目 entry 被移除
- [x] 7.4 从 worktree 内调用归档，验证 project path 解析到主 repo
- [x] 7.5 mock 旧版 CC（`claude` 是一个 shim，返回 `1.0.0`），验证跳过 purge
- [x] 7.6 非交互模式 `--purge-cc=auto`，验证不提示直接执行
- [x] 7.7 `--purge-cc=skip`，验证 claude 根本不被调用
