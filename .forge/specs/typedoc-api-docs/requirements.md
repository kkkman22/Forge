---
status: completed
feature: typedoc-api-docs
layout: requirements
created: 2026-04-28
tier: standard
---
# 需求文档：API 文档生成（TypeDoc）

## 简介

为 Forge 项目的 `src/` 目录下的公开函数和类型生成 API 参考文档。使用 TypeDoc 从现有 JSDoc 注释和 TypeScript 类型声明自动生成结构化的 HTML 文档，并集成到 CI 流水线中，确保文档与代码始终保持同步。

## 术语表

- **TypeDoc**：TypeScript 项目的文档生成工具，从源码中的 JSDoc 注释和类型信息生成 HTML/JSON 格式的 API 参考文档
- **Doc_Generator**：文档生成模块，负责调用 TypeDoc 并管理配置、入口点和输出
- **Entry_Point**：入口点，TypeDoc 用于确定哪些模块需要生成文档的源文件路径
- **CI_Pipeline**：持续集成流水线，基于 GitHub Actions 的自动化构建和验证流程
- **JSDoc_Comment**：源码中以 `/** ... */` 格式编写的文档注释，TypeDoc 从中提取描述信息
- **API_Surface**：公开 API 表面，指项目中通过 `export` 导出的函数、类型、接口等公开符号
- **Doc_Output**：文档输出目录，存放 TypeDoc 生成的 HTML 文件的目标路径

## 需求

### 需求 1：TypeDoc 依赖安装与配置文件

**用户故事：** 作为开发者，我希望项目中包含 TypeDoc 工具及其配置，以便团队成员能一致地生成 API 文档。

#### 验收标准

1. THE Doc_Generator SHALL 将 `typedoc` 作为 `devDependencies` 安装，不包含在生产依赖或发布产物中
2. THE Doc_Generator SHALL 在项目根目录提供 `typedoc.json` 配置文件，定义入口点、输出目录和主题等选项
3. WHEN `typedoc.json` 配置文件不存在或格式无效时，THE Doc_Generator SHALL 在执行时输出包含文件路径和错误原因的描述性错误
4. THE Doc_Generator SHALL 使用精确版本号锁定 `typedoc` 依赖（与项目现有 devDependencies 版本策略一致）

### 需求 2：文档生成脚本

**用户故事：** 作为开发者，我希望通过一条 npm 脚本命令即可生成完整的 API 文档，以便快速查阅和验证。

#### 验收标准

1. THE Doc_Generator SHALL 在 `package.json` 中提供 `docs` 脚本，执行 `npm run docs` 即可生成完整的 API 文档
2. WHEN 文档生成成功时，THE Doc_Generator SHALL 将 HTML 输出写入 `docs/api/` 目录
3. WHEN 源码中存在 TypeDoc 无法解析的 JSDoc 语法错误时，THE Doc_Generator SHALL 以非零退出码终止并输出错误位置信息
4. THE Doc_Generator SHALL 在生成前清除 `docs/api/` 目录中的旧文件，确保输出始终反映当前源码状态

### 需求 3：入口点与公开 API 范围

**用户故事：** 作为开发者，我希望文档仅覆盖项目的公开 API，避免内部实现细节暴露在参考文档中。

#### 验收标准

1. THE Doc_Generator SHALL 以 `src/` 目录下的 TypeScript 源文件作为入口点
2. THE Doc_Generator SHALL 仅为通过 `export` 导出的函数、类型、接口和常量生成文档
3. WHEN 源文件中的符号标记了 `@internal` JSDoc 标签时，THE Doc_Generator SHALL 排除该符号不生成文档
4. THE Doc_Generator SHALL 从 TypeScript 类型声明中自动提取参数类型、返回类型和泛型约束信息

### 需求 4：与现有 tsconfig.json 兼容

**用户故事：** 作为开发者，我希望 TypeDoc 复用项目现有的 TypeScript 配置，避免维护重复的编译选项。

#### 验收标准

1. THE Doc_Generator SHALL 引用项目根目录的 `tsconfig.json` 作为 TypeScript 编译选项来源
2. WHEN `tsconfig.json` 中的 `compilerOptions` 发生变更时，THE Doc_Generator SHALL 自动适应新配置无需额外修改
3. IF TypeDoc 与 `tsconfig.json` 中的某些选项不兼容，THEN THE Doc_Generator SHALL 在 `typedoc.json` 中通过 `tsconfig` 字段指定覆盖项并添加注释说明原因

### 需求 5：CI 流水线集成

**用户故事：** 作为开发者，我希望 CI 自动验证文档能否正常生成，以便在代码合并前发现 JSDoc 注释的错误。

#### 验收标准

1. THE CI_Pipeline SHALL 在 `check` job 中添加文档生成验证步骤，执行 `npm run docs` 并检查退出码
2. WHEN 文档生成失败时（JSDoc 语法错误、类型引用断裂等），THE CI_Pipeline SHALL 将该步骤标记为失败并阻止合并
3. THE CI_Pipeline SHALL 将文档生成步骤放置在 `typecheck` 和 `lint` 之后执行（依赖类型检查通过）
4. THE CI_Pipeline SHALL 不将生成的文档产物上传或提交到仓库（文档为按需生成的构建产物）

### 需求 6：输出目录与版本控制

**用户故事：** 作为开发者，我希望生成的文档不被提交到 Git 仓库，避免仓库体积膨胀和合并冲突。

#### 验收标准

1. THE Doc_Generator SHALL 将输出目录配置为 `docs/api/`
2. THE Doc_Generator SHALL 在 `.gitignore` 中添加 `docs/api/` 条目，排除生成产物
3. WHEN 开发者执行 `npm run docs` 后，THE Doc_Generator SHALL 在 `docs/api/` 目录下生成可直接在浏览器中打开的 `index.html` 文件
4. THE Doc_Generator SHALL 确保 `docs/api/` 目录不包含在 `package.json` 的 `files` 字段中（不随 npm 包发布）

### 需求 7：主题与可读性配置

**用户故事：** 作为文档阅读者，我希望生成的 API 文档具有清晰的导航结构和良好的可读性。

#### 验收标准

1. THE Doc_Generator SHALL 使用 TypeDoc 默认主题生成文档，确保包含侧边栏导航、搜索功能和面包屑路径
2. THE Doc_Generator SHALL 配置项目名称为 `Forge Loop`，在文档标题和页头中显示
3. THE Doc_Generator SHALL 启用源码链接功能，使文档中的每个符号可跳转到对应的源文件位置
4. WHEN 函数或类型缺少 JSDoc 描述时，THE Doc_Generator SHALL 仍然生成该符号的文档条目（包含类型签名但无描述文本）

### 需求 8：JSDoc 注释规范与验证

**用户故事：** 作为开发者，我希望有明确的 JSDoc 编写规范，以便团队产出一致且高质量的文档注释。

#### 验收标准

1. THE Doc_Generator SHALL 支持标准 JSDoc 标签：`@param`、`@returns`、`@throws`、`@example`、`@deprecated`、`@internal`
2. WHEN JSDoc 注释中的 `@param` 标签引用了不存在的参数名时，THE Doc_Generator SHALL 输出警告信息
3. THE Doc_Generator SHALL 将 TypeDoc 的警告级别配置为 `error`（将警告视为错误），确保 CI 中不通过含有文档问题的代码
4. WHEN 源码中使用 `@example` 标签时，THE Doc_Generator SHALL 在文档中以代码块格式渲染示例代码

### 需求 9：向后兼容性与非侵入性

**用户故事：** 作为现有开发者，我希望 TypeDoc 的引入不影响现有的构建、测试和发布流程。

#### 验收标准

1. THE Doc_Generator SHALL 不修改现有的 `build`、`test`、`lint`、`typecheck`、`check` 脚本行为
2. THE Doc_Generator SHALL 不引入运行时依赖（TypeDoc 仅作为 devDependency）
3. WHEN 执行 `npm run check` 时，THE Doc_Generator SHALL 不被包含在该脚本中（文档生成为独立步骤，不阻塞本地开发循环）
4. THE Doc_Generator SHALL 不要求修改现有源码中的 JSDoc 注释格式（兼容当前 `/** ... */` 风格）
