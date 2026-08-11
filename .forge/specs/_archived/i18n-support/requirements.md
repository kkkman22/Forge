---
status: obsolete
status_note: "废弃：Forge 是开发者工具，AI agent 原生处理中英文，i18n 框架属过度工程。基础设施（i18n.ts、locale-detector.ts、locales/*.json）零调用者，目标 CLI 被 forge-loop-native-fusion 删除。死代码已清理。"
feature: i18n-support
layout: requirements
created: 2026-04-28
tier: standard
---
# 需求文档：国际化（i18n）支持

## 简介

为 Forge 项目添加多语言框架，支持 SKILL.md 文件和用户提示信息的国际化。实现中文（zh）和英文（en）的运行时语言切换，使 CLI 输出、错误信息和技能文档能够根据用户偏好以对应语言呈现。

## 术语表

- **I18n_Engine**：国际化引擎，负责加载翻译资源、解析语言键、返回对应语言的字符串
- **Locale_Detector**：语言环境检测器，负责从系统环境变量、配置文件或 CLI 参数中确定当前语言
- **Translation_File**：翻译文件，以 JSON 格式存储某一语言的所有翻译键值对
- **Language_Key**：语言键，用于标识一条可翻译字符串的唯一标识符（如 `cli.error.notGitRepo`）
- **Locale**：语言标识符，遵循 BCP 47 格式（如 `zh`、`en`）
- **SKILL_Resolver**：技能文档解析器，负责根据当前语言加载对应语言版本的 SKILL.md 文件
- **Config_Store**：配置持久化模块，负责读写 `.forge/config.md` 中的用户偏好设置
- **Fallback**：回退机制，当请求的语言缺少某翻译时使用默认语言的对应值

## 需求

### 需求 1：翻译文件结构与加载

**用户故事：** 作为开发者，我希望翻译资源以结构化文件组织，以便维护和扩展多语言支持。

#### 验收标准

1. THE I18n_Engine SHALL 从 `locales/` 目录加载 JSON 格式的翻译文件，每种语言对应一个文件（如 `locales/zh.json`、`locales/en.json`）
2. WHEN 翻译文件包含嵌套键时，THE I18n_Engine SHALL 支持点分隔路径访问（如 `cli.error.notGitRepo`）
3. WHEN 翻译文件不存在或格式无效时，THE I18n_Engine SHALL 抛出包含文件路径和错误原因的描述性错误
4. THE I18n_Engine SHALL 在首次调用时加载翻译文件并缓存，后续调用直接使用缓存
5. FOR ALL 有效的翻译键值对，将翻译文件序列化为 JSON 再解析回对象 SHALL 产生等价的键值映射（round-trip 属性）

### 需求 2：语言环境检测与优先级

**用户故事：** 作为用户，我希望系统能自动检测我的语言偏好，同时允许我显式指定语言。

#### 验收标准

1. THE Locale_Detector SHALL 按以下优先级确定当前语言（从高到低）：CLI `--lang` 参数 > `.forge/config.md` 中的 `lang` 字段 > 环境变量 `FORGE_LANG` > 系统 locale（`LANG` / `LC_ALL`）> 默认值 `en`
2. WHEN CLI 传入 `--lang` 参数时，THE Locale_Detector SHALL 使用该参数值作为当前语言，忽略其他来源
3. WHEN 检测到的语言标识符不在已支持语言列表中时，THE Locale_Detector SHALL 回退到默认语言 `en` 并输出警告信息
4. THE Locale_Detector SHALL 将带区域标识的 locale（如 `zh_CN.UTF-8`）规范化为基础语言代码（如 `zh`）

### 需求 3：CLI `--lang` 选项

**用户故事：** 作为用户，我希望通过命令行参数临时切换语言，以便在不修改配置的情况下使用不同语言。

#### 验收标准

1. THE forge-loop CLI SHALL 接受 `--lang <locale>` 选项，其中 locale 为支持的语言代码
2. WHEN `--lang` 指定了无效的语言代码时，THE forge-loop CLI SHALL 输出有效语言列表并拒绝启动
3. WHEN `--lang` 未指定时，THE forge-loop CLI SHALL 委托 Locale_Detector 按优先级链确定语言

### 需求 4：字符串翻译与插值

**用户故事：** 作为开发者，我希望用语言键替换硬编码字符串，并支持动态参数插值。

#### 验收标准

1. THE I18n_Engine SHALL 提供 `t(key: string, params?: Record<string, string>): string` 函数，根据当前语言返回翻译后的字符串
2. WHEN 翻译字符串包含 `{paramName}` 占位符时，THE I18n_Engine SHALL 将占位符替换为 `params` 中对应键的值
3. WHEN 请求的语言键在当前语言中不存在时，THE I18n_Engine SHALL 回退到默认语言（en）的对应值
4. WHEN 语言键在所有语言中均不存在时，THE I18n_Engine SHALL 返回键本身作为字符串（如 `cli.error.unknown`）
5. IF 插值参数中缺少占位符所需的键，THEN THE I18n_Engine SHALL 保留原始占位符文本不替换

### 需求 5：SKILL.md 多语言支持

**用户故事：** 作为用户，我希望技能文档以我偏好的语言呈现，以便更好地理解工作流。

#### 验收标准

1. THE SKILL_Resolver SHALL 支持按语言加载 SKILL.md 文件，文件命名约定为 `SKILL.md`（默认语言）和 `SKILL.{locale}.md`（其他语言，如 `SKILL.en.md`）
2. WHEN 当前语言对应的 SKILL 文件不存在时，THE SKILL_Resolver SHALL 回退到默认的 `SKILL.md` 文件
3. THE SKILL_Resolver SHALL 保持 SKILL.md 的 frontmatter 格式不变，仅翻译正文内容
4. WHEN 解析 SKILL 文件时，THE SKILL_Resolver SHALL 验证 frontmatter 中的 `name` 字段与目录名一致

### 需求 6：语言偏好持久化

**用户故事：** 作为用户，我希望语言偏好被保存，以便下次使用时无需重复设置。

#### 验收标准

1. THE Config_Store SHALL 在 `.forge/config.md` 的 frontmatter 中读写 `lang` 字段
2. WHEN 用户通过 CLI 设置语言偏好时，THE Config_Store SHALL 将新值写入 `.forge/config.md`
3. WHEN `.forge/config.md` 不存在时，THE Config_Store SHALL 创建该文件并写入默认配置
4. THE Config_Store SHALL 保留 `.forge/config.md` 中的其他已有字段不被覆盖

### 需求 7：源码字符串提取

**用户故事：** 作为开发者，我希望 `src/*.ts` 中的硬编码用户可见字符串被替换为 i18n 键调用，以便统一管理翻译。

#### 验收标准

1. THE I18n_Engine SHALL 为 `src/forge-loop-cli.ts` 中的所有用户可见字符串（错误信息、警告信息、状态输出）提供对应的语言键
2. THE I18n_Engine SHALL 为 `src/run-manager.ts` 和 `src/sdk-driver.ts` 中的 `console.log` / `console.warn` / `console.error` 输出提供对应的语言键
3. WHILE 进行字符串提取时，THE I18n_Engine SHALL 保持内部日志和调试信息为英文不翻译（仅翻译用户可见输出）

### 需求 8：纯函数设计与可测试性

**用户故事：** 作为开发者，我希望 i18n 模块遵循项目的纯函数设计模式，以便于单元测试和属性测试。

#### 验收标准

1. THE I18n_Engine SHALL 将翻译查找实现为纯函数：接受语言键、当前 locale 和翻译数据，返回翻译字符串，无副作用
2. THE Locale_Detector SHALL 将优先级解析实现为纯函数：接受各来源的值，返回最终 locale，无副作用
3. THE I18n_Engine SHALL 将字符串插值实现为纯函数：接受模板字符串和参数对象，返回替换后的字符串
4. FOR ALL 有效的翻译数据和语言键，翻译查找函数的输出 SHALL 为确定性的（相同输入产生相同输出）

### 需求 9：向后兼容性

**用户故事：** 作为现有用户，我希望 i18n 功能的引入不破坏现有工作流和命令行行为。

#### 验收标准

1. WHEN 未指定任何语言配置时，THE forge-loop CLI SHALL 保持与当前版本相同的输出行为（默认英文）
2. THE I18n_Engine SHALL 不引入新的必需依赖项（使用自定义轻量实现而非 i18next 等外部库）
3. WHEN `.forge/config.md` 中不包含 `lang` 字段时，THE Locale_Detector SHALL 正常工作并回退到环境变量或默认值
4. THE forge-loop CLI SHALL 保持所有现有 CLI 选项的行为不变，`--lang` 为新增可选参数
