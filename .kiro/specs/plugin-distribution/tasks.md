# Tasks

## Task 1: Phase A — 资产盘点

- [x] 1.1 列出 Forge repo 根目录所有资产：skills/、agents/、hooks/、scripts/、templates/、src/、dist/、test/、docs/、packs/、rules/、locales/、examples/
- [x] 1.2 对每项资产判定 plugin 兼容性类别（a/b/c/d），写入 feasibility.md 表格
- [x] 1.3 验证所有 skill/agent 文件的 frontmatter 字段符合 CC plugin 要求
- [x] 1.4 清点 `hooks/hooks.json` 中的相对路径是否在 plugin context 下仍能 resolve

## Task 2: Phase A — Layout 差异分析

- [x] 2.1 对比当前布局 vs plugin 推荐布局，记录每处差异
- [x] 2.2 分析 `commands/` 目录新建的成本和 API 约定
- [x] 2.3 分析 `src/` TypeScript 代码是否适合放进 plugin（预判：不适合，仅 Forge Loop 用）
- [x] 2.4 分析 `.forge/` 与 plugin 关系：确认 `.forge/` 不随 plugin 分发

## Task 3: Phase A — Install UX 基准

- [x] 3.1 在干净机器上完整走一遍 clone 方式安装，计时
- [x] 3.2 在干净机器上完整走一遍 dist 方式安装，计时
- [x] 3.3 做一个 mock plugin install 走查预期步骤数
- [x] 3.4 形成对比表：步骤数、耗时、先决条件、失败恢复难度

## Task 4: Phase A — 风险矩阵与推荐

- [x] 4.1 梳理迁移风险：breaking change、frozen-zone 兼容、企业用户影响
- [x] 4.2 编写 rollback 计划
- [x] 4.3 给出 go/no-go/conditional-go 推荐
- [x] 4.4 至少 1 位 maintainer review feasibility.md
- [x] 4.5 若 no-go：归档本 spec，记录 blockers；若 go/conditional-go：进入 Phase B

## Task 5: Phase B — plugin.json 编写

- [x] 5.1 基于 Phase A 决议，新增 repo 根 `plugin.json`
- [x] 5.2 版本同步：`version` 字段从 `package.json` 读取或由 release 脚本同步
- [x] 5.3 `skills` / `agents` / `commands` / `hooks` 字段指向正确相对路径
- [x] 5.4 `scripts.postInstall` / `postUpdate` 打印友好提示
- [x] 5.5 本地 `claude plugin validate` 通过

## Task 6: Phase B — commands/ 目录与生成脚本

- [x] 6.1 新增 `commands/` 目录
- [x] 6.2 新增 `scripts/gen-plugin-commands.mjs`，从 `skills/*/SKILL.md` frontmatter 生成 `commands/*.md`
- [x] 6.3 运行生成脚本，产出 18 个 `commands/*.md`
- [x] 6.4 人工 review 每个生成文件，补充缺失的 description
- [x] 6.5 生成脚本纳入 CI，防止 skill 和 command 不同步

## Task 7: Phase B — marketplace.json

- [x] 7.1 新增 repo 根 `marketplace.json`
- [x] 7.2 决定 marketplace 所在 branch（主 branch vs 独立 `marketplace` branch）
- [x] 7.3 记录 marketplace URL 到 README
- [x] 7.4 `/doctor` 或 `claude plugin marketplace add <url>` 验证 marketplace 可发现

## Task 8: Phase B — build-dist.sh 与 CI 扩展

- [x] 8.1 `scripts/build-dist.sh` 新增 `build-dist-plugin()` 函数，产出 `dist-plugin/forge-plugin-<version>.zip`
- [x] 8.2 `.github/workflows/ci.yml` 新增 `plugin-validate` job
- [x] 8.3 plugin-validate job：checkout → install CC → `claude plugin validate`
- [x] 8.4 plugin-validate job 增加本地 install 冒烟测试（`claude -p "/forge status"`）
- [x] 8.5 tag release workflow 产出 `forge-plugin-<version>.zip` artifact
- [x] 8.6 `npm run check` 集成 plugin schema validator

## Task 9: Phase B — 测试

- [x] 9.1 新增 `test/plugin-manifest.test.ts`
- [x] 9.2 JSON schema 校验：必需字段、版本一致、路径存在
- [x] 9.3 Contract test：每个 `commands/*.md` 有 description frontmatter
- [x] 9.4 Contract test：`plugin.json` 版本 === `package.json` 版本
- [x] 9.5 手动 e2e：干净环境安装 plugin，运行 `/forge init && /forge status`

## Task 10: Phase B — 冲突检测

- [x] 10.1 更新 `/forge status` 或 `skills/forge-status/SKILL.md`，增加"检测 clone + plugin 同时存在"逻辑
- [x] 10.2 同时存在时打印诊断和建议
- [x] 10.3 测试此检测逻辑

## Task 11: Phase B — 文档与迁移指南

- [x] 11.1 `README.md` 重构"安装"章节，列出三种方式，推荐 plugin
- [x] 11.2 `README.md` 新增"Plugin 迁移指南"章节
- [x] 11.3 `CHANGELOG.md` 新增 `[ADDED]` 条目
- [x] 11.4 `SECURITY.md` 提及 plugin trust model
- [x] 11.5 `CONTRIBUTING.md` 新增本地调试方法（`claude plugin install . --plugin-dir .`）

## Task 12: Phase B — ADR 与归档

- [x] 12.1 新增 ADR `.forge/decisions/<date>-plugin-distribution.md`
- [x] 12.2 ADR 记录：Phase A 结论、Phase B 实施范围、EOL 时间表、替代方案
- [x] 12.3 合入 main
- [x] 12.4 发版 tag，触发 marketplace 首次可用性

## Task 13: Phase B — 可选 MCP bundle（条件执行）

- [x] 13.1 若 Phase A 推荐包含 MCP bundle：新建 `forge-mcp-bundle/` 子 plugin
- [x] 13.2 MCP bundle 的 `plugin.json` 独立版本
- [x] 13.3 声明 bitbucket、mcp-atlassian、markitdown 等常用 MCP
- [x] 13.4 `${user_config.*}` 占位，sensitive 字段入 keychain
- [x] 13.5 README 单独章节说明 MCP bundle 为可选
- [x] 13.6 若 Phase A 不推荐：跳过本 task，记录在 ADR 中

## Task 14: 发布与观察期

- [x] 14.1 发布 plugin 正式版（先预发布 beta）
- [x] 14.2 观察 2 周的用户安装反馈和 issue
- [x] 14.3 根据反馈决定是否提前或延后 Current_Dist_Script EOL
- [x] 14.4 2 周后在 CHANGELOG 和 README 更新稳定性声明
- [x] 14.5 spec 标记为 completed 并归档
