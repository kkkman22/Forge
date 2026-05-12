# Tasks

## Task 1: `scripts/resume-from-pr.mjs` 核心脚本

- [x] 1.1 新增 `scripts/resume-from-pr.mjs`，使用 Node 的 fs/process/child_process，零第三方依赖
- [x] 1.2 实现 `parseTarget(value)`：支持 GitHub/GitLab/Bitbucket URL、纯数字、`org/repo#N` 速记
- [x] 1.3 实现 `fetchPRMetadata(target)`：按 host 分派到 gh/glab/bitbucket，统一返回 PRMetadata
- [x] 1.4 实现每个 fetcher 的 10s timeout 和 fallback 到 `fetcherUsed: 'none'`
- [x] 1.5 实现 `resolveSlug(metadata)`：title → branch → description → decisions → 交互提示
- [x] 1.6 实现 PR_Slug_Cache 读写（`.forge/.pr-slug-cache.json`），TTL 7 天
- [x] 1.7 实现 `loadContextBundle(slug)`：收集 spec/plan/progress/reviews/adrs + missing 列表
- [x] 1.8 实现 `updateStatus(slug, metadata)`：写 `.forge/status.md`（含冲突交互）
- [x] 1.9 实现 `writeRunReport(...)`：写 `.forge/runs/<ts>-resume-from-pr.md`
- [x] 1.10 实现 `--json` 输出模式（SKILL 消费）和人类可读模式（直接 CLI 调用）
- [x] 1.11 实现 OTel event `forge.resume.from_pr` emit（仅当 OTEL_EXPORTER_* 环境变量存在时）

## Task 2: `skills/forge-resume/SKILL.md` 更新

- [x] 2.1 在 Workflow 章节新增 "从 PR 恢复（--from-pr）" 小节，说明分支流程
- [x] 2.2 新增"失败模式"子节：列举 CC 版本过低、slug 推断失败、缓存过期、冲突 status.md 等
- [x] 2.3 新增 "`--from-pr` 与 `--spec` 互斥" 规则说明
- [x] 2.4 更新 SKILL 顶部的 description，加入 "支持 --from-pr 快速恢复"
- [x] 2.5 保持 SKILL ≤150 行（ccbp-inspired-hardening R3 约束）；超行时把失败模式移到 `reference.md`

## Task 3: `.gitignore` 与缓存管理

- [x] 3.1 `.gitignore` 加一行 `.forge/.pr-slug-cache.json`
- [x] 3.2 `scripts/resume-from-pr.mjs` 处理缓存文件损坏（JSON parse 失败）时静默重建，不阻断
- [x] 3.3 提供 `FORGE_NO_CACHE=1` 环境变量跳过缓存读取

## Task 4: PR_Metadata_Fetcher 各 host 适配

- [x] 4.1 `gh` adapter：使用 `gh pr view <num> --json ...`，处理 `auth: not logged in` 错误
- [x] 4.2 `glab` adapter：使用 `glab mr view <num> --output json`
- [x] 4.3 `bitbucket` adapter：`curl` + `BITBUCKET_TOKEN` env；未设置则退化为 none
- [x] 4.4 `unknown` host 处理：只读 `git log --all --oneline` + branch name 推断
- [x] 4.5 统一错误格式：`{ fetcherUsed: 'none', warning: string }`

## Task 5: 契约测试与单元测试

- [x] 5.1 新增 `test/resume-from-pr.test.ts`：mock child_process.exec，覆盖 parseTarget / resolveSlug / loadContextBundle
- [x] 5.2 新增 test fixture：`test/fixtures/pr-github.json`、`test/fixtures/pr-gitlab.json`、`test/fixtures/pr-bitbucket.json`
- [x] 5.3 扩展 `test/contract.skills.test.ts`：断言 `skills/forge-resume/SKILL.md` 含 "从 PR 恢复"、"--from-pr" 关键字和互斥规则
- [x] 5.4 新增 property test：任意 slug 字符串（a-z0-9-）输入 `resolveSlug` 不崩溃
- [x] 5.5 `npm run check` 全量通过

## Task 6: 文档与 README

- [x] 6.1 `README.md` "快速开始" 加入 `/forge resume --from-pr <url>` 迷你示例
- [x] 6.2 `README.md` 新增"团队协作：接手他人 PR"小节
- [x] 6.3 `CHANGELOG.md` 新增 `[ADDED]` 条目，cross-reference Claude Code 2.1.29
- [x] 6.4 `.forge/decisions/` 新增 ADR 记录"引入 --from-pr 作为跨会话恢复入口"

## Task 7: 端到端手动验证

- [x] 7.1 在 Forge 自己的 repo 开一个 test PR，运行 `/forge resume --from-pr <url>`，确认 CC session 恢复 + Forge status 正确
- [x] 7.2 切到空 branch 再次运行，确认在"已有 status.md 冲突"场景下正确提示
- [x] 7.3 临时 rename `gh` 使其不可用，确认退化为 branch 推断正常工作
- [x] 7.4 用 GitLab URL 测试（若有可用环境），或 mock
- [x] 7.5 非交互模式 `FORGE_INTERACTIVE=0 /forge resume --from-pr <不存在的 PR>`，确认 exit 1 且无 prompt
- [x] 7.6 缓存命中场景：连续两次运行，第二次 log 中标注 "cache hit"
