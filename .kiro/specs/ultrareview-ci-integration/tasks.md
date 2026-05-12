# Tasks

## Task 1: Review_Wrapper 脚本实现

- [x] 1.1 新增 `scripts/run-ci-ultrareview.sh`，包含参数校验、`claude` 可用性检查（exit 2）、timeout 封装
- [x] 1.2 实现 `claude ultrareview "$PR" --json` 调用，捕获 stdout/stderr/exit code
- [x] 1.3 实现 JSON 解析：用 `jq` 提取 `severity_counts`、findings 列表；解析失败时走 stub 分支
- [x] 1.4 实现 Markdown artifact 生成函数：frontmatter + `## Summary` + `## Findings`（按 P0–P3 分组） + `## Raw JSON`
- [x] 1.5 实现 exit 策略：P0 存在 → exit 1；CLI 非零且 STRICT=1 → 透传 exit code；其他 → exit 0
- [x] 1.6 新增 `chmod +x scripts/run-ci-ultrareview.sh`，在 pre-commit / CI 中确认可执行
- [x] 1.7 实现 stub artifact（rate-limit / timeout / parse fail 三种场景各自的 Markdown 模板）

## Task 2: CI Workflow 文件

- [x] 2.1 新增 `.github/workflows/ultrareview.yml`，设置 `on.pull_request.types = [opened, synchronize, reopened]`
- [x] 2.2 配置 `permissions: pull-requests: write, contents: read`，`timeout-minutes: 20`
- [x] 2.3 job-level 或 step-level 条件：`ANTHROPIC_API_KEY` secret 未设置时软跳过并 emit warning
- [x] 2.4 step：`actions/checkout@v4` with `fetch-depth: 0`
- [x] 2.5 step：安装 Claude Code（通过 `curl ... | bash` 或已有 action），设置 `ANTHROPIC_API_KEY` env
- [x] 2.6 step：执行 `bash scripts/run-ci-ultrareview.sh ${{ github.event.pull_request.number }}`
- [x] 2.7 step：`actions/upload-artifact@v4` 上传 `.forge/reviews/<n>-ci.md`，`if: always()`
- [x] 2.8 step：`actions/github-script@v7` 读取 artifact 并 post PR comment（summary + severity counts + link）
- [x] 2.9 校验：用 `actionlint` 或等价工具通过 lint

## Task 3: Review_Artifact 格式标准化

- [x] 3.1 在 `templates/` 下新增 `review-ci.md.tmpl`（frontmatter + 四个 section 骨架）
- [x] 3.2 Review_Wrapper 通过简单变量替换生成最终文件（避免引入 handlebars 依赖）
- [x] 3.3 `severity_counts` 的 YAML 输出顺序固定为 P0/P1/P2/P3
- [x] 3.4 `timeout` 和 `partial` 两个可选字段，仅在真发生时写入

## Task 4: Forge_Review_SKILL 感知 CI 产物

- [x] 4.1 修改 `skills/forge-review/SKILL.md`，在 Workflow 章节开头新增 "CI 证据接入" 步骤
- [x] 4.2 增加 `[confirmed-by-ci]` 前缀规则说明（匹配条件：file_path + category 相同）
- [x] 4.3 明确 SKILL 对 `.forge/reviews/<n>-ci.md` 只读，不得修改
- [x] 4.4 SKILL 中说明：CI 产物缺失时按原流程进行，不警告、不阻断

## Task 5: init.sh 新增启用选项

- [x] 5.1 在安全级别收集之后新增交互提示 "是否启用 CI AI 评审？[y/N]"
- [x] 5.2 接受时 `cp templates/ultrareview.yml .github/workflows/ultrareview.yml`，并 emit ANTHROPIC_API_KEY 配置提醒
- [x] 5.3 拒绝时不动，不产生任何 workflow 文件
- [x] 5.4 新增 `templates/ultrareview.yml` 作为 init 拷贝源

## Task 6: 契约测试覆盖

- [x] 6.1 新增 `test/run-ci-ultrareview.test.sh`（或 `test/ci-ultrareview.test.ts` 用 execSync 调用）mock `claude` 验证 wrapper 各分支
- [x] 6.2 扩展 `test/contract.test.ts`：断言 `.github/workflows/ultrareview.yml` 存在时，必须包含 `pull_request` 触发、`ANTHROPIC_API_KEY` 引用、upload-artifact step
- [x] 6.3 扩展 `test/contract.skills.test.ts`：断言 `skills/forge-review/SKILL.md` 包含 "CI 证据接入" 小节和 `[confirmed-by-ci]` 关键字
- [x] 6.4 新增 fixture：`test/fixtures/ultrareview-sample.json`（典型 ultrareview 输出）和 `test/fixtures/review-ci-expected.md`（预期 artifact）
- [x] 6.5 本地 `npm run check` 全部通过

## Task 7: 文档与 CHANGELOG

- [x] 7.1 `README.md` 新增 "CI AI 评审" 章节，说明启用方式、所需 secret、opt-out 路径
- [x] 7.2 `CHANGELOG.md` 在下一个 Unreleased 版本新增条目：`[ADDED]` CI UltraReview integration
- [x] 7.3 `.forge/decisions/` 新增 ADR：记录"引入 claude ultrareview 作为 CI 辅助评审"的决策与替代方案
- [x] 7.4 `docs/` 下新增 `ci-ultrareview-usage.md`：操作手册（如何读 artifact、如何禁用、如何 STRICT 模式）

## Task 8: 端到端验证

- [x] 8.1 在 fork 仓库开一个 test PR，确认 workflow 触发、artifact 上传、PR comment 正确
- [x] 8.2 验证 P0 finding 场景：故意提交一个已知 P0 问题，确认 workflow fail 且 comment 标明
- [x] 8.3 验证软失败：临时移除 `ANTHROPIC_API_KEY`，确认 step skipped 且 PR 不被阻断
- [x] 8.4 验证本地 `/forge review` 后运行时，能识别 `.forge/reviews/<n>-ci.md` 并标记 `[confirmed-by-ci]`
- [x] 8.5 全部通过后合入 main，更新 ROADMAP
