---
status: completed
feature: docs-governance-system
layout: requirements
created: 2026-05-24
tier: standard
---
# Requirements Document

> 中文规格：文档治理体系（docs-governance-system）

## Introduction

Forge 仓库当前沉淀了大量 Markdown 文档（实测 ~997 个，涵盖 `.forge/`、`.kiro/`、`skills/`、`docs/`、根目录），但只有面向用户/贡献者的人类向文档需要被"总目录"索引。现有 `docs/INDEX.md` 因手工维护而失修：标注更新日期为 2026-05-12，仍声明"18 个命令"，并且 `docs/best-practices/`、`reference-architecture.md`、`forge-constitution-detail.md`、`slimming-migration.md`、`opusplan-guide.md` 等多篇文档未被收录；根目录还残留 `forge-v2.3-executive-audit.md`、`forge-v2.3-technical-review.md` 两份一次性审计产物。

本特性建立一套**文档治理体系**，通过五个机制解决文档膨胀、失修与重复表述问题：

1. **分类隔离**：按受众把 Markdown 拆为四个域（人类向、Agent 上下文、项目状态、根级元文档），明确各自纪律。
2. **总目录自动生成**：以文件 frontmatter 为单一信源，由生成器脚本产出 `docs/INDEX.md`，禁止手写。
3. **失修检测**：`updated` 字段对账、陈旧度告警、链接体检三道闸。
4. **数量纪律**：套用项目宪法 §4.2 思路，`docs/` 数量上限与根级白名单写入 `.forge/config.md`，超限即阻断或评审。
5. **单一信源与段落级嵌入**：把会重复出现的事实片段（命令清单、三维路由表、安全分级表等）抽取为机器可读的 SSOT，文档以嵌入指令引用 SSOT 段落，由渲染器在构建期注入并由同步闸门校验，杜绝多份手写副本漂移（典型现状：README 自称"22 个命令"、`docs/INDEX.md` 仍写"18 个命令"、`docs/onboarding-beginner.md` 也写"18 个命令"，三处不一致）。

精细化更新：2026-05-24（首版）；2026-05-24（增补第 5 层 SSOT 与段落级嵌入）

## Glossary

- **Markdown 文档**：仓库内任意以 `.md` 结尾的文件。
- **文档域**：按受众与生命周期划分的文档逻辑分组，仅有四个：域 A、域 B、域 C、域 D。
  - **域 A（人类向文档）**：路径根为 `docs/` 的文档，受众是用户与贡献者。
  - **域 B（Agent 上下文）**：路径根为 `skills/`、`commands/`、`agents/`、`rules/`、`packs/`、`templates/`、`examples/`、`hooks/`、`locales/`、`scripts/`、`src/`、`test/`、`.github/`、`.githooks/`、`.codex/agents/`、`.claude/agents/`、`.claude/rules/`、`.claude/commands/` 等供 AI 按需加载的文档。
  - **域 C（项目状态）**：路径根为 `.forge/` 或 `.kiro/` 的工作流产物（决策、状态、归档、规格等）。
  - **域 D（根级元文档）**：仓库根目录第一层（不递归）放置的 `.md`。
- **索引域**：进入总目录索引的文档集合，定义为域 A 与域 D 的并集。
- **总目录**：路径为 `docs/INDEX.md` 的文档导航文件；其英文镜像为 `docs/INDEX.en.md`。
- **Frontmatter**：Markdown 文件首部的 YAML 元数据块，由首尾两行 `---` 包裹。
- **Frontmatter Schema**：本系统约定的 frontmatter 字段集合，必填字段为 `title`、`category`、`audience`、`updated`、`owner`。
- **INDEX 生成器**：脚本 `scripts/build-docs-index.ts`，扫描索引域并生成 `docs/INDEX.md`。
- **INDEX 校验器**：脚本 `scripts/check-docs-index.sh`，对比生成结果与仓库中已提交的 `docs/INDEX.md`。
- **失修检测器**：脚本 `scripts/check-docs-staleness.ts`，按 `updated` 字段计算陈旧度并对账 git 历史。
- **链接体检器**：脚本 `scripts/check-docs-links.ts`，校验索引域内的相对链接与章节锚点。
- **根级白名单**：仓库根目录允许出现的 `.md` 文件清单，写入 `.forge/config.md`，固定 8 项：`README.md`、`CHANGELOG.md`、`SECURITY.md`、`CONTRIBUTING.md`、`ROADMAP.md`、`AGENTS.md`、`CLAUDE.md`、`LICENSE.md`。
- **docs 数量上限**：`docs/` 目录下 `.md` 文件计数允许的最大值，写入 `.forge/config.md` 的 `docs.max_count` 字段，初始值 30；中文与英文镜像（`*.md` 与 `*.en.md`）合计 1 篇，按"文档对"计数。
- **陈旧度等级**：根据 `updated` 字段距 UTC 当日的天数划分，分为 fresh（≤ 90 天）、warning（> 90 天且 ≤ 180 天）、critical（> 180 天）、invalid（缺失/格式错误/未来日期）。
- **文档对**：同一篇文档的中文与英文镜像，命名约定为 `<slug>.md`（中文）与 `<slug>.en.md`（英文），共同计为 1 个"文档对"。
- **UTC 当日**：以 UTC 时区当日 00:00:00 为起算点的日期口径，用于陈旧度计算与 `updated` 字段对账。
- **文档对配对状态**：标识文档对的双语完成度，取值为 paired（中英文齐备）、cn-only（仅中文）、en-only（仅英文）、orphan_mirror（仅存在 `.en.md` 而缺中文原文）。
- **severity 枚举**：检查脚本告警严重度的闭合枚举，取值为 critical、error、warning、notice、info；退出码映射为 critical → 2、error → 1、warning/notice/info → 0、脚本自身异常 → 3。
- **staleness.warning_days**：`.forge/config.md` 中陈旧度 warning 阈值（天），默认 90，合法范围 [1, 365]。
- **staleness.critical_days**：`.forge/config.md` 中陈旧度 critical 阈值（天），默认 180，合法范围 [1, 730]。
- **staleness.exempt_paths**：`.forge/config.md` 中陈旧度豁免路径数组，默认 `["LICENSE.md", "ROADMAP.md"]`。
- **staleness.warning_log_cap**：`.forge/config.md` 中 warning 注解输出条数上限，默认 50。
- **配置回退策略**：当 `.forge/config.md` 缺失字段或字段值非法时，回落到默认值并发出 warning（severity=warning，退出码 0）。
- **排除前缀**：扫描时优先匹配的路径前缀清单，命中即跳过域归属，包含：`apps/`、`dist/`、`dist-plugin/`、`node_modules/`、`.git/`、`test-results/`、`apps/forge-loop-desktop/src-tauri/target/`、`.claude/worktrees/`。
- **SSOT（单一信源）**：被多篇文档重复引用的事实片段的权威来源；以机器可读格式（JSON、YAML 或表格化 Markdown）置于约定路径 `docs/_ssot/<topic>.<ext>` 或来源文件（例：`commands/registry.json`、命令文件 frontmatter 的聚合视图）。
- **SSOT 注册表**：`.forge/config.md` 中 `docs.ssot_sources` 字段声明的 SSOT 主题列表，每项包含 `topic`（标识符）、`source`（绝对路径或 glob，相对仓库根）、`renderer`（渲染器名称），用于解耦嵌入指令与具体来源路径。
- **嵌入指令**：人类向文档（域 A）中用于引用 SSOT 的标记块，语法形如：

  ```
  <!-- ssot:begin topic=<topic> render=<renderer> [args...] -->
  ...由渲染器生成的内容...
  <!-- ssot:end topic=<topic> -->
  ```

  同一文档内同一 `topic` 的嵌入指令出现次数不限。
- **嵌入渲染器**：把 SSOT 数据按指定 `renderer` 名称渲染为 Markdown 片段的纯函数；初始内置渲染器包含 `commands-table`（命令速查表）、`routing-table`（三维路由表）、`security-tiers`（安全分级表）、`json-list`（通用 JSON 数组列表）。
- **嵌入扩展指令**：本系统沿用 Forge 项目宪法已声明的 `#[[file:<relative_path>]]` 整文件嵌入语法（见项目宪法 §"steering"），并在其上扩展段落级嵌入 `<!-- ssot:begin ... -->` 标记块；两者的渲染产物均必须由 INDEX 同步闸门校验。
- **嵌入同步闸门**：脚本 `scripts/check-docs-embeds.ts`，重新渲染索引域所有嵌入指令并与仓库提交版本逐字节比对，逻辑同 INDEX 同步闸门。

## Requirements

### Requirement 1: 文档域定义与边界

**User Story:** 作为 Forge 维护者，我希望仓库内的 Markdown 文档按受众落到四个互斥的域，以便后续治理只针对真正需要被人查找的文档。

#### Acceptance Criteria

1. WHEN 扫描仓库中的某个 Markdown 文档，THE Docs_Governance_System SHALL 先按排除前缀清单匹配；命中排除前缀即跳过域归属，否则归属到域 A、域 B、域 C、域 D 中且仅一个域。
2. THE Docs_Governance_System SHALL 仅把域 A 与域 D 的文档纳入索引域。
3. WHEN 一个 Markdown 文档同时匹配多个域的路径前缀，THE Docs_Governance_System SHALL 按以下顺序解析归属：域 C（`.forge/`、`.kiro/`） → 域 B（`skills/`、`commands/`、`agents/`、`rules/`、`packs/`、`templates/`、`examples/`、`hooks/`、`locales/`、`scripts/`、`src/`、`test/`、`.github/`、`.githooks/`、`.codex/agents/`、`.claude/agents/`、`.claude/rules/`、`.claude/commands/`） → 域 A（`docs/`） → 域 D（仓库根目录第一层）。
4. IF 一个 Markdown 文档不属于任何已声明的域路径前缀，THEN THE Docs_Governance_System SHALL 在校验时报告未分类错误并阻断提交。
5. THE Docs_Governance_System SHALL 维护显式排除前缀清单 `apps/`、`dist/`、`dist-plugin/`、`node_modules/`、`.git/`、`test-results/`、`apps/forge-loop-desktop/src-tauri/target/`、`.claude/worktrees/`，并在域归属之前先匹配该清单，命中即跳过该文档。
6. IF 一个 Markdown 文档未匹配任何排除前缀且未匹配任何域路径前缀，THEN THE Docs_Governance_System SHALL 在标准错误输出一条记录，包含字段 `script=check-docs-domains`、文档相对路径、错误标识 `UNCLASSIFIED_DOC`、人类可读提示，并以非零状态码退出。
7. THE Docs_Governance_System SHALL 在判定域 D 时仅扫描仓库根目录第一层 `.md` 文件，不递归子目录。

### Requirement 2: Frontmatter Schema 强制

**User Story:** 作为索引生成器的开发者，我希望每篇人类向文档都带结构化元数据，以便我能机械地拼出索引而不靠人脑记。

#### Acceptance Criteria

1. THE Frontmatter_Validator SHALL 要求索引域中的每个 Markdown 文档以 frontmatter 块起始；frontmatter 块由文件第 1 行（允许首部存在可选 BOM）的 `---` 起始行与其后第二个独占行 `---` 关闭行包裹。
2. THE Frontmatter_Validator SHALL 要求 frontmatter 至少包含字段 `title`（字符串，长度 1–200 字符，允许 CJK Unicode 码点）、`category`（字符串，枚举值见需求 11）、`audience`（字符串数组，长度 1–10，每元素长度 1–50 字符）、`updated`（ISO 8601 短日期，格式 `YYYY-MM-DD`，不晚于 UTC 当日且不早于 2026-04-28）、`owner`（字符串，长度 1–100）。
3. WHERE 文档为英文镜像（文件名以 `.en.md` 结尾），THE Frontmatter_Validator SHALL 额外允许 frontmatter 包含 `mirror_of` 字段（字符串，长度 1–500，必须为相对路径，不以 `/` 开头且不含 `..` 段，指向中文原文）。
4. IF 索引域中的文档 frontmatter 出现以下任一违规情形（必填字段缺失、字段类型不符、长度越界、枚举不匹配、日期越界、路径非法），THEN THE Frontmatter_Validator SHALL 输出至少包含「文件路径」与「字段名 + 违规原因」的诊断记录并以非零状态码退出。
5. IF frontmatter 中包含已声明 schema 之外的字段，THEN THE Frontmatter_Validator SHALL 以非零状态码退出并在诊断中提示未知字段名。
6. THE Frontmatter_Parser SHALL 把合法的 frontmatter YAML 块解析为结构化对象。
7. THE Frontmatter_Serializer SHALL 把结构化对象写回为合法的 frontmatter YAML 块；序列化输出 SHALL 在 frontmatter 内部使用 LF 行尾、关闭行 `---` 后恰好接一个 LF 与一个空行再接文档正文，且不追加额外尾部空行。
8. FOR ALL 合法的 frontmatter 对象，先序列化再解析得到的对象 SHALL 与原对象在字段值与字段集合上等价（往返一致性）。
9. FOR ALL 合法的 frontmatter YAML 块，先解析再序列化得到的字符串 SHALL 在再次解析后产生与首次解析等价的对象（解析—序列化—解析的往返一致性）。

### Requirement 3: INDEX 自动生成器

**User Story:** 作为团队成员，我希望 `docs/INDEX.md` 由脚本生成，以便它和源文档永远同步，没人需要再手工维护。

#### Acceptance Criteria

1. THE Index_Generator SHALL 接受索引域文档集合作为输入并输出一份完整的 `docs/INDEX.md` 内容字符串。
2. THE Index_Generator SHALL 按 frontmatter 中的 `category` 字段分组、按 `title` 的 Unicode 码点序（locale 无关）排序生成索引条目；同 `title` 时以相对路径作为二次排序键。
3. THE Index_Generator SHALL 在每个条目中至少呈现：文档标题、相对路径、`category`、`updated` 日期；`updated` 字段以 ISO 8601 短日期 `YYYY-MM-DD` 格式呈现。
4. WHERE 一篇文档存在英文镜像（同 `<slug>` 下同时存在 `<slug>.md` 与 `<slug>.en.md`），THE Index_Generator SHALL 把两者合并为同一条目并并列展示两条相对链接。
5. THE Index_Generator SHALL 在输出尾部以单独段落写入"由 `scripts/build-docs-index.ts` 生成；请勿手动编辑"提示，并以单个 LF（`\n`）结尾。
6. FOR ALL 输入 D，`Index_Generator(Index_Generator_Input(D))` 的输出 SHALL 等于 `Index_Generator(D)` 的输出（生成幂等性）。
7. FOR ALL 输入 D 与其任意置换 D'（仅文件枚举顺序不同），`Index_Generator(D)` 的输出 SHALL 在字节层面等于 `Index_Generator(D')` 的输出（生成确定性）。
8. THE Index_Generator SHALL 仅从被索引文档的 frontmatter 读取展示字段；THE Index_Generator SHALL NOT 从 git log、文件系统时间戳、环境变量、系统当前时间等不稳定来源读取数据；THE Index_Generator SHALL NOT 在输出中包含"最后生成时间"等会破坏确定性的字段。
9. WHEN `Index_Generator` 完成生成，THE Index_Generator SHALL 把输出写入 `docs/INDEX.md`，并在生成中文版同步生成 `docs/INDEX.en.md`。
10. IF 索引域中存在文档未通过 Frontmatter Schema 校验，THEN THE Index_Generator SHALL 拒绝生成、不写入或修改任何输出文件并以非零状态码退出。

### Requirement 4: INDEX 同步闸门

**User Story:** 作为代码评审者，我希望 PR 在 `docs/` 改动后自动卡住失同步的 INDEX，以便我不用肉眼比对。

#### Acceptance Criteria

1. WHERE 在 pre-commit 钩子中运行，THE Index_Sync_Checker SHALL 仅当 `git diff --cached --name-only` 输出包含 `docs/` 路径或 `.forge/config.md` 时执行 `scripts/check-docs-index.sh`；WHERE 在 CI 流水线中运行，THE Index_Sync_Checker SHALL 无条件执行该脚本。
2. WHEN `Index_Sync_Checker` 启动，THE Index_Sync_Checker SHALL 在临时目录中重新生成 `docs/INDEX.md` 与 `docs/INDEX.en.md` 候选内容并与仓库中已提交版本逐字节比对。
3. IF 候选内容与仓库版本字节不一致，THEN THE Index_Sync_Checker SHALL 输出 unified diff 形式的差异摘要（单文件最多 200 行，超出时截断并附「已截断,共 N 行差异」提示）并以非零状态码退出。
4. THE Index_Sync_Checker SHALL 在退出消息中提示开发者运行 `npm run docs:index` 重新生成，且 SHALL NOT 写回或修改暂存区中的任何 INDEX 内容。
5. WHEN 暂存区版本与重新生成的候选内容存在任意字节差异，THE Index_Sync_Checker SHALL 视为人工编辑，输出差异行号并以非零状态码退出。
6. WHEN CI 流水线检测到提交方使用 `--no-verify` 绕过 pre-commit（通过提交元数据、缺失的钩子运行痕迹或可观测的旁路标记），THE Index_Sync_Checker SHALL 以非零状态码退出并阻断合并，且 SHALL NOT 因 INDEX 恰好同步而放行；该规则与 AC2 的字节比对 SHALL 共同生效，任一触发即阻断。

### Requirement 5: 陈旧度检测

**User Story:** 作为文档负责人，我希望系统按 `updated` 字段告诉我哪些文档可能过时，以便我安排维护。

#### Acceptance Criteria

1. THE Staleness_Detector SHALL 对索引域中每个文档读取 frontmatter 的 `updated` 字段并以 UTC 当日 00:00:00 为基准计算距 UTC 当日的天数差。
2. WHEN 某文档的天数差大于 `staleness.warning_days` 且小于等于 `staleness.critical_days`，THE Staleness_Detector SHALL 在报告中将该文档标记为陈旧度等级 warning。
3. WHEN 某文档的天数差大于 `staleness.critical_days`，THE Staleness_Detector SHALL 在报告中将该文档标记为陈旧度等级 critical。
4. WHEN 检测完成，THE Staleness_Detector SHALL 同时输出一份按 `category` 分组的人类可读文本报告与一份 JSON 文件 `.forge/staleness-report.json`，二者均包含每个文档的路径、`updated` 日期、天数差、陈旧度等级。
5. WHERE 在 CI 上下文中运行（环境变量 `CI=true`），IF 任一文档陈旧度等级为 critical 或 invalid，THEN THE Staleness_Detector SHALL 以非零状态码退出。
6. WHERE 在 CI 上下文中运行，IF 任一文档陈旧度等级为 warning 且无 critical 或 invalid 文档，THEN THE Staleness_Detector SHALL 以零状态码退出但在标准输出中追加 `::warning::` GitHub Actions 注解前缀。
7. IF 文档 frontmatter 缺失 `updated` 字段、字段值不符合 ISO 8601 短日期格式或为晚于 UTC 当日的未来日期，THEN THE Staleness_Detector SHALL 将该文档标记为陈旧度等级 invalid 并在报告中附原因。
8. THE Staleness_Detector SHALL 从 `.forge/config.md` 读取 `staleness.warning_days`（默认 90，合法范围 [1, 365]）、`staleness.critical_days`（默认 180，合法范围 [1, 730]）与 `staleness.exempt_paths`（数组，默认 `["LICENSE.md", "ROADMAP.md"]`）；IF 任一字段缺失或值非法，THEN THE Staleness_Detector SHALL 回落到默认值并发出 severity=warning 的诊断（退出码 0）。
9. WHEN 在 CI 上下文中输出的 warning 注解条数超过 `staleness.warning_log_cap`（默认 50），THE Staleness_Detector SHALL 截断超出部分并在末尾追加单条 `::notice::` 注解汇总剩余条数。

### Requirement 6: updated 字段与 git 历史对账

**User Story:** 作为评审者，我希望系统能识破"改了正文却忘了改 updated"的提交，以便陈旧度检测不被绕过。

#### Acceptance Criteria

1. THE Updated_Auditor SHALL 把文档首行 `---` 与第二个独占行 `---` 之间的内容视为 frontmatter，其后视为正文；THE Updated_Auditor SHALL 以 `git log --follow -1 --format=%cs -- <path>` 输出（UTC ISO 短日期）作为该文档最近一次内容修改提交的提交日期，以追溯重命名。
2. WHEN 文档的 frontmatter `updated` 字段早于其最近一次内容修改提交日期且差值 ≥ 2 天，THE Updated_Auditor SHALL 在报告中标记该文档为"updated 漂移"，漂移条目 SHALL 包含字段：文件路径、frontmatter updated、git 最近提交日期 UTC、差值天数。
3. WHEN 一次提交的 diff 中存在某文档的正文行的增、删或改且未把 frontmatter 的 `updated` 字段更新为本次提交日期（UTC 当日），THE Updated_Auditor SHALL 在 pre-commit 钩子中以非零状态码退出并在标准错误输出提示。
4. WHERE 提交仅修改了 frontmatter 字段且 diff 中不含正文行的增删改，THE Updated_Auditor SHALL 不强制要求 `updated` 字段变化并以零状态码退出。
5. IF 文档在 `git log --follow` 中不存在记录（视为新文件），THEN THE Updated_Auditor SHALL 接受任何不晚于 UTC 当日的 `updated` 值；IF `updated` 晚于 UTC 当日，THEN THE Updated_Auditor SHALL 以非零状态码退出。
6. WHERE 在 pre-commit 钩子中以 `--fix` 选项运行，THE Updated_Auditor SHALL 把违规文档的 `updated` 字段写为 UTC 当日短日期、列出被改写的文件路径并以零状态码退出。
7. THE Updated_Auditor SHALL 在计算最近一次正文修改日期时跳过仅由合并提交、rebase 或 cherry-pick 产生且不含正文行 diff 的提交。

### Requirement 7: 链接体检

**User Story:** 作为读者，我希望索引上的链接都点得开，以便我不踩死链。

#### Acceptance Criteria

1. THE Link_Checker SHALL 扫描索引域内每篇文档处于代码块（围栏 ``` 或四空格缩进式）之外的全部 Markdown 链接，识别范围包含行内链接 `[text](target)`、图片链接 `![alt](src)`、引用式链接 `[text][ref]` 与定义 `[ref]: target`、自动链接 `<url>`。
2. WHEN 链接目标为相对路径（不以 `/`、协议前缀或 `#` 起始），THE Link_Checker SHALL 以源文件所在目录为基准解析路径并校验目标文件存在于仓库工作树中。
3. THE Link_Checker SHALL 按以下规则匹配锚点：形如 `#anchor` 的目标在源文件内匹配；形如 `path#anchor` 在解析后的目标文件内匹配；锚点按 GFM 规则生成，ASCII 字母转小写、空格替换为 `-`、删除连字符以外的 ASCII 标点、保留 CJK 字符原样；同名标题按出现顺序追加 `-1`、`-2`… 后缀。
4. IF 任一链接的文件目标缺失或锚点匹配失败，THEN THE Link_Checker SHALL 输出失败记录，每条记录包含字段：源文件路径、1 起始行号、原始目标值、失败原因，并以非零状态码退出。
5. WHERE 链接目标以 `http://`、`https://`、`mailto:` 或 `tel:` 起始，THE Link_Checker SHALL 跳过该链接的可达性与存在性校验，仅按 RFC 3986 通用语法校验格式。

### Requirement 8: docs 数量纪律

**User Story:** 作为项目宪法的执行者，我希望套用 §4.2 的纪律到 `docs/`，避免文档继续无序膨胀。

#### Acceptance Criteria

1. THE Docs_Quota_Checker SHALL 从 `.forge/config.md` 的 frontmatter 字段 `docs.max_count` 读取数量上限，默认值 30，合法区间 [1, 1000]；IF 字段缺失或值非法，THEN THE Docs_Quota_Checker SHALL 回落到默认值并发出 severity=warning 的诊断。
2. THE Docs_Quota_Checker SHALL 把计数对象限定为 `docs/` 下递归扫描得到的 `.md` 文件，排除 `.mdx` 后缀、任意层级目录索引 `README.md` 与 `INDEX*.md`；同一文档对的中文与英文镜像合并计为 1 项。
3. IF `docs/` 下的文档对总数大于等于 `docs.max_count`，THEN THE Docs_Quota_Checker SHALL 输出当前计数、上限以及按 `audience` 与 `category` 维度的分布并以非零状态码退出。
4. WHEN 文档对总数等于 `docs.max_count - 1`，THE Docs_Quota_Checker SHALL 输出 warning 但以零状态码退出。
5. WHEN 用户调用 `/forge learn`，THE Docs_Quota_Checker SHALL 被调用以输出文档增量评审摘要。
6. IF 调用方使用 `--allow-grow` 临时豁免但未随附位于 `.forge/decisions/` 的 ADR 路径，THEN THE Docs_Quota_Checker SHALL 以非零状态码退出。
7. IF `docs.max_count` 的值高于上一次配置且 `.forge/decisions/` 中不存在对应的 ADR 文件，THEN THE Docs_Quota_Checker SHALL 以非零状态码退出。

### Requirement 9: 根级白名单

**User Story:** 作为来 Forge 的新人，我希望仓库根目录干净到一眼能扫完，以便快速理解项目门面。

#### Acceptance Criteria

1. THE Root_Whitelist_Checker SHALL 从 `.forge/config.md` 读取 `docs.root_whitelist` 字段获取允许出现在仓库根目录的 `.md` 文件名清单；匹配语义为精确文件名、大小写敏感、不支持通配符；扫描范围限于仓库根目录第一层、不跟随符号链接、不包含隐藏文件。
2. THE Root_Whitelist_Checker SHALL 视以下 8 个条目为初始白名单：`README.md`、`CHANGELOG.md`、`SECURITY.md`、`CONTRIBUTING.md`、`ROADMAP.md`、`AGENTS.md`、`CLAUDE.md`、`LICENSE.md`；WHERE 仓库根目录存在无后缀 `LICENSE` 文件，THE Root_Whitelist_Checker SHALL 与 `LICENSE.md` 互为兼容，任一存在即视为白名单条目；IF 两者同时存在，THEN THE Root_Whitelist_Checker SHALL 以非零状态码退出。
3. IF 仓库根目录下存在白名单外的 `.md` 文件，THEN THE Root_Whitelist_Checker SHALL 输出违规文件路径并以退出码 1 退出；WHEN 不存在违规，THE Root_Whitelist_Checker SHALL 以退出码 0 退出。
4. WHEN 一份违规文件名匹配启发式（以 `audit-`、`review-`、`forge-v` 为前缀，或包含 ISO 日期前缀 `YYYY-MM-DD-`），THE Migration_Helper SHALL 把该文件识别为一次性审计或评审产物并准备迁移；IF 文件名不匹配启发式，THEN THE Migration_Helper SHALL 跳过自动迁移、输出人工处理提示并以非零状态码退出。
5. WHEN 在初始迁移阶段执行，THE Migration_Helper SHALL 使用 `git mv` 把 `forge-v2.3-executive-audit.md` 与 `forge-v2.3-technical-review.md` 迁移至 `.forge/archive/`；操作完成后源路径 SHALL 不再存在且 git 历史 SHALL 保留。
6. THE Migration_Helper SHALL 按以下规则选择归档目标：`.forge/archive/` 用于不再阅读的产物；`docs/audits/` 用于仍可能被检索的审计；目标由 owner 在迁移 PR 中显式标注。
7. IF 当前生效的白名单（无论来自 `.forge/config.md` 配置还是默认 8 项回退）在 `.forge/decisions/` 中无对应 ADR 文件，THEN THE Root_Whitelist_Checker SHALL 拒绝并以非零状态码退出；初始 8 项默认白名单的 ADR 由阶段 1 迁移建立，未建立期间 SHALL 退化为发出 severity=warning 的诊断且以零状态码退出。
8. IF `.forge/config.md` 不存在、缺失 `docs.root_whitelist` 字段或字段值非法（结构错误、元素不符合精确文件名约束），THEN THE Root_Whitelist_Checker SHALL 使用 8 项默认值并发出 severity=warning 的诊断、以零状态码退出。

### Requirement 10: 与 /forge learn 的集成

**User Story:** 作为 Forge 用户，我希望每次 `/forge learn` 都顺手评审一下文档增量，以便文档治理不靠人记得。

#### Acceptance Criteria

1. WHEN 用户调用 `/forge learn`，THE Forge_Learn_Hook SHALL 在 learn 主流程之前 inline 触发 `Docs_Quota_Checker`、`Staleness_Detector` 与 `Link_Checker`，整体调用时间预算不超过 10 秒，并把结果汇总到 learn 报告的"文档增量"小节。
2. THE Forge_Learn_Hook SHALL 把检测器输出的 critical 级别问题作为 `/forge learn` 的明确建议项写入 `.forge/knowledge/sessions/` 当前会话文件，每条建议至少包含字段：来源检测器、文档相对路径、问题摘要。
3. IF 任一检测器返回非零状态码、运行超过时间预算或脚本不存在，THEN THE Forge_Learn_Hook SHALL 把"文档增量"小节标注为 needs_attention 并不阻断 learn 主流程。
4. WHEN 三个检测器全部以零状态码完成且无 critical 级别问题，THE Forge_Learn_Hook SHALL 在 learn 报告"文档增量"小节标注为 clean 并附检测时间戳（UTC ISO 8601）。

### Requirement 11: 分类与受众枚举

**User Story:** 作为 INDEX 生成器，我希望 `category` 与 `audience` 字段是受控枚举，以便分组结果稳定。

#### Acceptance Criteria

1. THE Frontmatter_Validator SHALL 把 `category` 字段约束为必填、单字符串（非数组）、区分大小写、全部小写连字符形式，且取值为以下枚举之一：`getting-started`、`daily-use`、`advanced`、`troubleshooting`、`contributing`、`reference`、`audits`。
2. THE Frontmatter_Validator SHALL 把 `audience` 字段约束为非空数组，长度 1–6，元素区分大小写、为小写连字符形式且不重复，每个元素取值为以下枚举之一：`new-user`、`daily-developer`、`advanced-user`、`contributor`、`maintainer`、`auditor`。
3. IF `category` 或 `audience` 出现枚举外的取值，THEN THE Frontmatter_Validator SHALL 输出违规字段、当前取值、合法取值集合，且不写出任何索引文件并以非零状态码退出。
4. THE Index_Generator SHALL 按 `category` 枚举固定顺序在 `docs/INDEX.md` 中分组，顺序为：`getting-started` → `daily-use` → `advanced` → `troubleshooting` → `contributing` → `reference` → `audits`；空分组 SHALL 在输出中省略而非保留空表。
5. WHERE 文档的 `audience` 字段包含多个元素，THE Index_Generator SHALL 以数组首位元素作为主要受众分组键，其余元素作为可读标签呈现在条目中。

### Requirement 12: 双语镜像策略

**User Story:** 作为多语言读者，我希望中文与英文版本被一致管理，以便阅读体验一致而不重复维护索引。

#### Acceptance Criteria

1. THE Bilingual_Pairing_Checker SHALL 把同一目录下符合命名约定 `<slug>.md` 与 `<slug>.en.md` 的两个文件识别为同一文档对，并在报告中以 paired、cn-only、en-only 三态之一标注其文档对配对状态。
2. WHERE 一份文档存在英文镜像，THE Bilingual_Pairing_Checker SHALL 校验英文镜像的 `mirror_of` frontmatter 字段为相对于该 `.en.md` 文件所在目录解析的相对路径并指向中文原文。
3. WHEN 中文版本被新增至 `docs/` 后超过 30 个自然日仍无英文镜像，THE Bilingual_Pairing_Checker SHALL 在 `Staleness_Detector` 报告中追加一条 missing_mirror 提示并记录首次发现日期，但不阻断提交。
4. THE Index_Generator SHALL 在生成 `docs/INDEX.en.md` 时把英文链接置于条目首位作为主链接、把中文链接紧随其后作为辅链接并附语言标记 `(EN)` 或 `(中)`。
5. IF 英文镜像存在但其 `mirror_of` 解析后的路径不指向同目录的 `<slug>.md` 或对应文件不存在，THEN THE Bilingual_Pairing_Checker SHALL 输出失败镜像路径并以非零状态码退出。
6. WHEN 同目录下存在 `<slug>.en.md` 而不存在 `<slug>.md`，THE Bilingual_Pairing_Checker SHALL 在报告中追加 orphan_mirror 提示，但不阻断提交。
7. WHEN 文档对中英文最近一次 git 提交日期差大于 14 个自然日，THE Bilingual_Pairing_Checker SHALL 在报告中追加 mirror_drift 提示，但不阻断提交。
8. IF 同一文档对中英两侧的 `category` 或 `audience` 字段值不一致，THEN THE Bilingual_Pairing_Checker SHALL 以非零状态码退出。

### Requirement 13: 错误信号统一

**User Story:** 作为运维者，我希望所有检查脚本失败时输出格式一致，以便我能在 CI 上统一解析。

#### Acceptance Criteria

1. THE Docs_Governance_System SHALL 在所有检查脚本（`Frontmatter_Validator`、`Index_Sync_Checker`、`Staleness_Detector`、`Updated_Auditor`、`Link_Checker`、`Docs_Quota_Checker`、`Root_Whitelist_Checker`、`Bilingual_Pairing_Checker`）输出的每条记录中至少包含字段：`script`（脚本名）、`severity`（critical|error|warning|notice|info 闭合枚举）、`file`（相对路径）、`message`（长度上限 500 字符，超出截断并附 `…[truncated]`）。
2. THE Docs_Governance_System SHALL 按以下退出码映射汇总：critical → 退出码 2、error → 退出码 1、warning/notice/info → 退出码 0；WHEN 单次运行同时存在多种 severity，THE Docs_Governance_System SHALL 取最高严重度对应的退出码。
3. WHERE 在 CI 上下文中运行（环境变量 `CI=true`），THE Docs_Governance_System SHALL 把 GitHub Actions 注解写入标准输出并按以下映射输出：critical 与 error → `::error file=<path>::<message>`；warning → `::warning file=<path>::<message>`；notice → `::notice file=<path>::<message>`；info SHALL NOT 输出注解。
4. WHERE 调用方传入 `--json` 选项，THE Docs_Governance_System SHALL 以 NDJSON 形式输出每条记录；WHERE 未传入 `--json` 选项，THE Docs_Governance_System SHALL 输出人类可读文本表格。
5. THE Docs_Governance_System SHALL 把多记录输出按 severity 降序排序，severity 相同时按 `file` 字典序排序，并在末行输出摘要 `Summary: <critical_count> critical, <error_count> error, <warning_count> warning`。
6. IF 脚本进程发生未捕获异常或 I/O 失败等自身异常路径，THEN THE Docs_Governance_System SHALL 以退出码 3 退出并把异常信息写入标准错误输出；退出码 3 SHALL 优先于 AC2 的 severity 退出码映射，即使运行中已发现 critical 或 error 级别记录，最终退出码 SHALL 为 3。

### Requirement 14: 性能与执行预算

**User Story:** 作为开发者，我不希望文档检查在每次 commit 前都拖慢我，所以脚本必须有可预测的执行时间。

#### Acceptance Criteria

1. WHERE 在基准硬件上运行（Apple Silicon M1+ 或 Linux x86_64，4 核及以上、8GB 内存及以上、SSD 存储），WHEN 索引域文档对总数小于等于 50，THE Index_Generator SHALL 在 5 秒内完成生成。
2. WHERE 在基准硬件上运行，WHEN 索引域文档对总数小于等于 50，THE Link_Checker SHALL 在 10 秒内完成扫描（不计 HTTP 链接外发请求）。
3. WHERE 在 pre-commit 钩子中运行，THE Index_Sync_Checker 与 Updated_Auditor 合计 SHALL 在 5 秒内完成。
4. WHEN 索引域文档对总数大于 50，THE Docs_Governance_System SHALL 按线性外推调整预算：每增加 50 对文档对，Index_Generator 预算 +5 秒、Link_Checker 预算 +10 秒；WHERE 处于冷启动场景，THE Docs_Governance_System SHALL 允许预算额外放宽 50%。
5. WHEN 任一检查脚本运行时间超出本需求约定预算的 1.5 倍，THE Docs_Governance_System SHALL 输出 severity=warning 的诊断但不阻断（退出码 0）。
6. WHERE 在 pre-commit 钩子中执行的提交仅包含非 `docs/` 路径的改动，THE Docs_Governance_System SHALL 走轻量路径，总耗时 SHALL 不超过 1 秒。

### Requirement 15: 迁移路径

**User Story:** 作为采纳本特性的维护者，我希望迁移过程可验证、可回滚，以便不会因为治理体系本身搞坏现状。

#### Acceptance Criteria

1. THE Migration_Plan SHALL 将迁移划分为四个阶段并为每个阶段定义量化 DoD：阶段 1 DoD 为根级白名单外文件全部迁移完成、baseline 报告产出、所有 `.md` 文件已归入四个域之一；阶段 2 DoD 为所有 `docs/` 文件 frontmatter 通过 `Frontmatter_Validator` 校验、INDEX 由生成器一次性产出且 `Index_Sync_Checker` 通过；阶段 3 DoD 为 pre-commit 钩子在 `Frontmatter_Validator`、`Index_Sync_Checker`、`Updated_Auditor` 三个检查器上全部启用且 CI 通过；阶段 4 DoD 为 `/forge learn` 输出"文档增量"小节并在最近一次 learn 调用中证明运行正常。
2. WHEN 阶段 1 完成，THE Migration_Plan SHALL 产出 `docs-governance-baseline.md` 报告，每条记录包含字段：源路径、目标路径、迁移时间戳；该报告 SHALL 由 owner 在 PR 中显式 approve。
3. WHEN 阶段 2 执行，THE Migration_Plan SHALL 采用半自动策略补齐 frontmatter：脚本生成草稿，维护者 review 后写入。
4. WHERE 处于阶段 3 pre-commit 启用前 7 个自然日的 grace period 内，THE Migration_Plan SHALL 把检查脚本输出降级为 severity=warning 且不阻断；WHEN grace period 结束，THE Migration_Plan SHALL 强制阻断违规提交。
5. IF 任一阶段验证失败，THEN THE Migration_Plan SHALL 允许通过 `git revert` 回滚该阶段的提交且不影响前序阶段。
6. IF 已合并到 main 后发现治理问题致 CI 持续阻断，THEN THE Migration_Plan SHALL 要求维护者在 24 小时内提交 hotfix revert PR。
7. THE Migration_Plan SHALL 要求每个阶段的实现遵循 RED → GREEN → REFACTOR 的 TDD 一致性，测试先行编写。
### Requirement 16: SSOT 注册表与来源契约

**User Story:** 作为文档维护者，我希望命令清单、路由表、安全分级等会重复出现的事实只在一个地方维护，以便修改一次自动同步到所有引用文档。

#### Acceptance Criteria

1. THE SSOT_Registry SHALL 从 `.forge/config.md` 的 `docs.ssot_sources` 字段读取 SSOT 主题列表；每项 SHALL 至少包含字段 `topic`（字符串，长度 1–50，区分大小写小写连字符形式）、`source`（仓库根相对路径或 glob，长度 1–500）、`renderer`（字符串，必须为内置或已注册的渲染器名称）。
2. THE SSOT_Registry SHALL 视以下四个主题为初始注册条目：`commands`（来源为 `commands/*.md` 与 `.claude/commands/*.md` 的 frontmatter 聚合，渲染器 `commands-table`）、`routing`（来源为 `docs/_ssot/routing.json`，渲染器 `routing-table`）、`security-tiers`（来源为 `docs/_ssot/security-tiers.json`，渲染器 `security-tiers`）、`gate-skills`（来源为 `docs/_ssot/gate-skills.json`，渲染器 `commands-table` 的扩展模式）。
3. IF SSOT 注册表中存在两个 `topic` 相同的条目，THEN THE SSOT_Registry SHALL 以非零状态码退出并输出冲突主题名。
4. IF SSOT 注册条目的 `source` 解析后不存在或 glob 匹配为空，THEN THE SSOT_Registry SHALL 以 severity=error 的诊断退出。
5. IF SSOT 注册条目的 `renderer` 不在已注册渲染器集合中，THEN THE SSOT_Registry SHALL 以 severity=error 的诊断退出并列出已注册的渲染器名称。
6. WHERE `.forge/config.md` 不存在或缺失 `docs.ssot_sources` 字段，THE SSOT_Registry SHALL 使用 AC2 的 4 项默认注册条目并发出 severity=warning 的诊断、以零状态码退出。
7. THE SSOT_Registry SHALL 拒绝 `topic` 名称与系统保留前缀冲突的注册条目，保留前缀包含：`internal-`、`debug-`、`forge-meta-`；IF 注册条目违反保留前缀约束，THEN THE SSOT_Registry SHALL 以非零状态码退出。

### Requirement 17: 段落级嵌入指令与渲染器

**User Story:** 作为文档作者，我希望在 Markdown 文档中以一对标记块声明"此处嵌入某 SSOT 主题"，以便事实变更后渲染产物自动同步。

#### Acceptance Criteria

1. THE Embed_Renderer SHALL 识别索引域文档中以下语法的嵌入指令：起始行 `<!-- ssot:begin topic=<topic> render=<renderer> [args] -->`、结束行 `<!-- ssot:end topic=<topic> -->`；起始行与结束行 SHALL 各占独立一行且 `topic` 值必须严格匹配。
2. WHEN 嵌入指令被识别，THE Embed_Renderer SHALL 调用 `<renderer>` 渲染器、输入对应 `topic` 的 SSOT 数据与起始行声明的 `args`，输出确定性的 Markdown 片段并替换起始行与结束行之间的全部文本（保留起止标记本身不变）。
3. THE Embed_Renderer SHALL 对所有内置渲染器（`commands-table`、`routing-table`、`security-tiers`、`json-list`）保证：相同输入 SHALL 产出字节级一致的输出；输出 SHALL NOT 包含时间戳、随机值或环境相关字段。
4. IF 文档中存在 `<!-- ssot:begin -->` 起始行但缺失对应的 `<!-- ssot:end -->` 结束行，或两者 `topic` 不匹配，THEN THE Embed_Renderer SHALL 以非零状态码退出并输出违规位置（文件路径、起始行号、不匹配原因）。
5. IF 嵌入指令引用的 `topic` 在 SSOT 注册表中不存在，THEN THE Embed_Renderer SHALL 以非零状态码退出并提示已注册主题列表。
6. IF 嵌入指令的 `render` 字段不在已注册渲染器集合中，THEN THE Embed_Renderer SHALL 以非零状态码退出并提示已注册渲染器列表。
7. THE Embed_Renderer SHALL 同时支持项目宪法已声明的 `#[[file:<relative_path>]]` 整文件嵌入语法：WHEN 该语法出现在域 A 文档中，THE Embed_Renderer SHALL 以源文件所在目录为基准解析路径、读取目标文件全文并直接替换该指令所在行；IF 目标文件不存在或路径越出仓库工作树，THEN THE Embed_Renderer SHALL 以非零状态码退出。
8. FOR ALL 合法的嵌入指令组 E 与对应 SSOT 数据 S，`Embed_Renderer(Embed_Renderer(E, S), S)` 的输出 SHALL 在字节层面等于 `Embed_Renderer(E, S)` 的输出（渲染幂等性）。
9. THE Embed_Renderer SHALL 不修改起止标记之间以外的任何文档内容；嵌入指令外部的字节序列在渲染前后 SHALL 完全一致。
10. WHERE 一个文档中同一 `topic` 的嵌入指令出现多次，THE Embed_Renderer SHALL 对每个出现位置独立渲染并产生相同的内部内容。

### Requirement 18: 嵌入同步闸门

**User Story:** 作为代码评审者，我希望 PR 在 SSOT 来源或嵌入指令变更后自动卡住未重渲染的文档，以便我不用肉眼比对副本。

#### Acceptance Criteria

1. WHERE 在 pre-commit 钩子中运行，THE Embed_Sync_Checker SHALL 仅当 `git diff --cached --name-only` 输出包含 `docs/`、`docs/_ssot/`、SSOT 注册表中任一 `source` 路径或 `.forge/config.md` 时执行 `scripts/check-docs-embeds.ts`；WHERE 在 CI 流水线中运行，THE Embed_Sync_Checker SHALL 无条件执行该脚本。
2. WHEN `Embed_Sync_Checker` 启动，THE Embed_Sync_Checker SHALL 在临时目录中对索引域内所有包含嵌入指令的文档重新渲染、以仓库提交版本为对照逐字节比对每对起止标记之间的内容。
3. IF 候选内容与仓库版本字节不一致，THEN THE Embed_Sync_Checker SHALL 输出 unified diff 形式的差异摘要（每个嵌入指令最多 100 行，超出时截断并附「已截断,共 N 行差异」提示）并以非零状态码退出。
4. THE Embed_Sync_Checker SHALL 在退出消息中提示开发者运行 `npm run docs:embeds` 重新渲染，且 SHALL NOT 写回或修改暂存区中的任何文档内容。
5. WHEN 暂存区版本中嵌入指令的内容与重新渲染的候选内容存在任意字节差异，THE Embed_Sync_Checker SHALL 视为人工编辑嵌入指令内容、输出违规文件路径与起始行号并以非零状态码退出。
6. WHEN CI 流水线检测到提交方使用 `--no-verify` 绕过 pre-commit（按 R4.AC6 同样的可观测信号），THE Embed_Sync_Checker SHALL 以非零状态码退出并阻断合并，且 SHALL NOT 因嵌入恰好同步而放行。
7. THE Embed_Sync_Checker SHALL 在所有错误记录中遵循需求 13 定义的统一错误信号格式（`script`、`severity`、`file`、`message` 四字段）。

### Requirement 19: SSOT 与嵌入的迁移与初始覆盖

**User Story:** 作为采纳本特性的维护者，我希望第 5 层在不破坏现有文档的前提下渐进引入，以便迁移可验证、可回滚。

#### Acceptance Criteria

1. THE Migration_Plan SHALL 把 SSOT 与嵌入的引入归入新增的阶段 5（在阶段 4 `/forge learn` 集成之后），其 DoD SHALL 为：四个初始 `topic`（`commands`、`routing`、`security-tiers`、`gate-skills`）的 SSOT 来源已建立、`README.md` 与 `docs/INDEX.md` 中"22 个命令"、"18 个命令"等历史不一致的字面值已被嵌入指令替换、`Embed_Sync_Checker` 在 CI 通过。
2. WHEN 阶段 5 启动，THE Migration_Plan SHALL 由脚本扫描索引域中字面包含 `\d+ 个命令` 或 `\d+ commands` 的位置并产出迁移建议清单，每条记录包含字段：源文件路径、行号、原始字面值、推荐替换为的嵌入指令；该清单 SHALL 由维护者 review 后再写入。
3. WHEN 阶段 5 完成，THE Migration_Plan SHALL 保证：所有"命令数量"字面值不再出现在索引域文档中；`/forge learn` 报告中"文档增量"小节包含一个新的 `embeds` 字段汇总嵌入指令总数、独立 topic 数与最近一次同步状态。
4. WHERE 处于阶段 5 启用前 7 个自然日的 grace period 内，THE Migration_Plan SHALL 把 `Embed_Sync_Checker` 输出降级为 severity=warning 且不阻断；WHEN grace period 结束，THE Migration_Plan SHALL 强制阻断违规提交。
5. IF 阶段 5 验证失败，THEN THE Migration_Plan SHALL 允许通过 `git revert` 回滚该阶段的提交且不影响阶段 1–4 的产出。
6. THE Migration_Plan SHALL 要求阶段 5 实现同样遵循 RED → GREEN → REFACTOR 的 TDD 一致性。

### Requirement 20: SSOT 与嵌入的性能预算

**User Story:** 作为开发者，我不希望嵌入渲染让 commit 或 CI 变慢，所以渲染与同步闸门必须有可预测的执行时间。

#### Acceptance Criteria

1. WHERE 在基准硬件上运行（同需求 14.AC1），WHEN 索引域文档对总数小于等于 50 且嵌入指令实例总数小于等于 100，THE Embed_Renderer SHALL 在 3 秒内完成全量渲染。
2. WHERE 在基准硬件上运行，WHEN 索引域文档对总数小于等于 50 且嵌入指令实例总数小于等于 100，THE Embed_Sync_Checker SHALL 在 5 秒内完成全量比对。
3. WHEN 嵌入指令实例总数大于 100，THE Docs_Governance_System SHALL 按线性外推调整预算：每增加 100 个实例，Embed_Renderer 预算 +3 秒、Embed_Sync_Checker 预算 +5 秒；WHERE 处于冷启动场景，THE Docs_Governance_System SHALL 允许预算额外放宽 50%。
4. WHEN `Embed_Renderer` 或 `Embed_Sync_Checker` 运行时间超出本需求约定预算的 1.5 倍，THE Docs_Governance_System SHALL 输出 severity=warning 的诊断但不阻断（退出码 0）。
5. WHERE 在 pre-commit 钩子中执行的提交未触动 `docs/`、`docs/_ssot/`、SSOT 注册表来源或 `.forge/config.md`，THE Embed_Sync_Checker SHALL 走轻量路径，总耗时 SHALL 不超过 1 秒。
