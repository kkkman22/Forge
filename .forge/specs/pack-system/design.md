---
feature: pack-system
layout: design
created: 2026-05-09
---

# Design Document

## 1. Overview

本设计把 12 条 Requirement 落到 **5 个 Core 纯函数模块 + 1 个新 skill + 2 个现有 skill 的 references 扩展 + `packs/` 目录约定**，采用**单仓库就近存储 + 分层覆盖（Custom > Pack > Core）+ Pack opt-in**三原则。Pack 机制不引入任何运行时框架依赖，完全用纯函数 + 文件系统约定实现。

映射关系：

| Requirement | 主要实现载体 |
|---|---|
| R1 Pack 发现 | `src/pack/loader.ts`（纯函数） + `packs/*/pack.yaml` |
| R2 项目级启用 | `.forge/config.md` YAML frontmatter `packs:` 字段 + `src/pack/config.ts` |
| R3 Zero-Pack-Zero-Impact | 所有新引擎的"空输入返回空结果"契约 + 回归测试 `test/pack/zero-pack-invariant.test.ts` |
| R4 Pack 管理命令 | `skills/forge-pack/SKILL.md` + `src/pack/commands.ts` |
| R5 Bounded Context 引擎 | `src/context/registry.ts`（纯函数） + `packs/<name>/contexts/` + `.forge/custom/contexts/` |
| R6 分 Context Glossary | `src/glossary/registry.ts`（纯函数） + 向后兼容单文件回退 |
| R7 Spec Leak Detector | `src/spec-leak-detector.ts`（纯函数） + `banned-patterns.yaml` schema |
| R8 Scenario Linter | `src/scenario-linter.ts`（纯函数） + 4 条默认规则 + pack 扩展规则 |
| R9 RED Verification Gate | `skills/forge-build/references/tdd-rules.md` 扩展 + `src/build.ts` 最小集成 |
| R10 Expected Output 字段 | `skills/forge-plan/references/atomic-task-format.md` 扩展 + `src/plan.ts` self-check 扩展 |
| R11 Custom Override | `src/pack/resolver.ts`（纯函数） + `.forge/custom/` 目录约定 |
| R12 NFR | fast-check property tests + TSDoc + 性能基准脚本 |

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Forge 核心工作流（18 命令 × 三维路由）                   │
│                                                                              │
│  forge-spec / forge-plan / forge-build / forge-review / forge-ship ...       │
│                                                                              │
│                ↓ 消费 Pack 引擎（pure function calls，opt-in）                │
│                                                                              │
│  ┌────────────────────────── Pack Engines (src/) ──────────────────────────┐ │
│  │                                                                         │ │
│  │  src/pack/        src/context/      src/glossary/                       │ │
│  │  ├─ loader.ts     ├─ registry.ts    ├─ registry.ts                      │ │
│  │  ├─ resolver.ts   └─ map.ts         └─ mismatch.ts                      │ │
│  │  ├─ config.ts                                                           │ │
│  │  └─ commands.ts   src/spec-leak-detector.ts                             │ │
│  │                   src/scenario-linter.ts                                │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                ↓ 从 packs/<name>/ 与 .forge/custom/ 读取数据                 │
└──────────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Domain Layer（单仓库存储）                             │
│                                                                              │
│  packs/                                                                      │
│  └─ <name>/                                                                  │
│      ├─ pack.yaml           ← 元数据                                         │
│      ├─ contexts/           ← Bounded Context 定义                           │
│      ├─ glossary/           ← 分 Context 术语表                              │
│      ├─ scenarios/          ← Gherkin 场景模板                               │
│      ├─ banned-patterns.yaml ← 禁用词清单                                    │
│      ├─ state-machines/     ← 状态机定义                                     │
│      ├─ templates/          ← 代码模板                                       │
│      ├─ lint-rules/         ← 领域 lint                                      │
│      ├─ agents/             ← 领域 agent 扩展                                │
│      └─ utils/              ← 领域工具                                       │
└──────────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Project Layer（业务项目，最高优先级）                       │
│                                                                              │
│  .forge/                                                                     │
│  ├─ config.md         ← frontmatter packs: [pms, ...]                        │
│  └─ custom/           ← 与 packs/<name>/ 目录结构镜像，覆盖生效               │
│      ├─ contexts/                                                            │
│      ├─ glossary/                                                            │
│      ├─ scenarios/                                                           │
│      ├─ banned-patterns.yaml                                                 │
│      └─ ...                                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3. Data Model

### 3.1 `Pack_Manifest`（`packs/<name>/pack.yaml`）

```yaml
name: pms                            # required, kebab-case, matches dir name
display_name: "Hotel PMS Domain Pack"  # required
description: "..."                   # required
forge_min_version: "2.4.0"           # required, semver
depends_on: []                       # optional, list of other pack names

extends:                             # required object
  contexts: ./contexts               # optional per key
  glossary: ./glossary
  scenarios: ./scenarios
  state_machines: ./state-machines
  banned_patterns: ./banned-patterns.yaml
  lint_rules: ./lint-rules
  templates: ./templates
  agents: ./agents
  utils: ./utils

feature_flags:                       # optional, pack-specific config hints
  forced_acceptance_contexts: [...]
  mutation_critical_modules: [...]
```

`extends` 中每个键对应一个已知类别；未知键被忽略（允许未来扩展）。

### 3.2 `Pack_Registry`

```ts
interface PackRegistry {
  packs: Map<string, PackEntry>;  // key = pack.name
  warnings: string[];             // discovery/parse warnings
}

interface PackEntry {
  name: string;
  displayName: string;
  description: string;
  forgeMinVersion: string;
  dependsOn: string[];
  extends: Record<string, string>;  // category → absolute path
  featureFlags: Record<string, unknown>;
  manifestPath: string;
  rootPath: string;
}
```

### 3.3 `.forge/config.md` frontmatter 扩展

```yaml
---
project: "Forge"
stack: ["TypeScript"]
security_level: 1
# ...existing fields...
packs:                 # 新增；可选字段
  - pms
  - marriott-sample    # 未来可能有其他
---
```

### 3.4 `Enabled_Packs` 结构

```ts
interface EnabledPacks {
  order: string[];                   // 按声明顺序
  entries: PackEntry[];              // 按 order 的对应 registry entry
  customLayerRoot: string;           // 绝对路径 to .forge/custom/
}
```

### 3.5 `ContextEntry`

```ts
interface ContextEntry {
  name: string;
  responsibility: string;
  aggregates: string[];
  inboundEvents: string[];
  outboundEvents: string[];
  upstream: string[];                // 其他 context 名
  downstream: string[];
  sourcePath: string;
  sourceLayer: "custom" | `pack:${string}` | "core";
  body: string;                      // markdown body（减去 frontmatter）
}

interface ContextRegistry {
  contexts: Map<string, ContextEntry>;
  map: ContextMapEntry[];
}

interface ContextMapEntry {
  source: string;
  target: string;
  type: "partnership" | "customer-supplier" | "conformist" | "acl" 
      | "open-host" | "published-language" | "shared-kernel";
  sourceLayer: string;
}
```

### 3.6 `GlossaryEntry`

```ts
interface GlossaryEntry {
  term: string;
  context: string;                   // "_shared" 表示跨 Context
  definition: string;
  aliases: string[];
  updated: string;                   // ISO date
  source: string | null;
  sourcePath: string;
  sourceLayer: "custom" | `pack:${string}` | "core";
}

interface GlossaryRegistry {
  entries: Map<string, GlossaryEntry>;  // key = `${context}::${term}`
  byTerm: Map<string, GlossaryEntry[]>; // key = term（跨 context 查询）
}
```

### 3.7 `LeakFinding`

```ts
interface LeakFinding {
  category: "code" | "infrastructure" | "framework" | "technical";
  file: string;
  line: number;                      // 1-indexed
  original: string;
  matchedTerm: string;
  suggestedRewrite: string | null;
  sourceLayer: string;               // which banned-patterns file caught it
}
```

### 3.8 `banned-patterns.yaml` schema

```yaml
schema_version: 1
categories:
  code:
    - pattern: "UserService"
      description: "类名不应出现在 spec"
      suggestion_template: "改为业务角色描述"
    - pattern: "regex:\\b\\w+Service\\b"
      description: "Service 后缀类名"
  infrastructure:
    - pattern: "regex:\\bPOST\\s+/\\w+"
      description: "HTTP 方法 + 路径"
    - pattern: "SELECT"
      description: "SQL 语句"
  framework:
    - pattern: "Controller"
    - pattern: "Middleware"
  technical:
    - pattern: "Redis"
    - pattern: "Kafka"
```

两种模式：字面量（字符串完全匹配词边界） vs `regex:<expr>`（正则匹配）。

### 3.9 `LintFinding`（Scenario Linter）

```ts
interface LintFinding {
  ruleId: string;                    // "SCN001" etc.
  severity: "error" | "warning";
  file: string;
  line: number;
  message: string;
}
```

## 4. Component Design

### 4.1 `src/pack/loader.ts`

**职责**：扫描 `packs/*/pack.yaml`，解析 manifest，返回 `Pack_Registry`。纯函数，IO 通过注入的 `fs` 接口（便于测试）。

核心签名：

```ts
export async function loadPackRegistry(
  reposRoot: string,
  fs: FileSystem = realFs,
): Promise<PackRegistry>;
```

实现要点：
- 使用 `fs.readdir(packsDir)` 列出子目录
- 对每个子目录尝试 `fs.readFile(<dir>/pack.yaml)`
- 用 `yaml` 库（已依赖）解析
- 校验必填字段存在且类型正确（手写 schema check，避免引入 Zod 作为新依赖，或复用项目已有验证层）
- 按 name 字母序 dedupe
- 失败的 pack 进入 `warnings`，不抛异常（honor Zero_Pack_Invariant——单个坏 pack 不影响 Core）

### 4.2 `src/pack/resolver.ts`

**职责**：按 Resolution_Order 解析相对路径到绝对路径。

核心签名：

```ts
export function resolvePath(
  relativePath: string,
  enabledPacks: EnabledPacks,
): { path: string; layer: string } | null;

export function resolveAllPaths(
  relativePath: string,
  enabledPacks: EnabledPacks,
): Array<{ path: string; layer: string }>;
```

`resolvePath` 返回首个命中；`resolveAllPaths` 返回所有层级命中，用于"并集"场景（例如 banned-patterns 是 union，不是 override）。

### 4.3 `src/pack/config.ts`

**职责**：从 `.forge/config.md` 解析 `packs:` frontmatter 字段，关联 `Pack_Registry` 生成 `EnabledPacks`。

核心签名：

```ts
export function parseEnabledPacks(
  configContent: string,
  registry: PackRegistry,
  customLayerRoot: string,
): { enabled: EnabledPacks; errors: string[] };
```

错误累计 `errors`（pack 名不在 registry、重复声明等），不抛异常。调用方决定是否升级为 fatal。`forge-pack enable` 使用此函数做预校验。

### 4.4 `src/pack/commands.ts`

**职责**：`forge-pack` skill 的子命令实现。纯函数返回输出字符串 + 文件修改列表，由 skill 驱动实际 IO（便于测试）。

核心签名：

```ts
export function commandList(registry: PackRegistry, enabled: EnabledPacks): string;
export function commandEnable(name: string, config: string, registry: PackRegistry): 
  { newConfig: string; message: string } | { error: string };
export function commandDisable(name: string, config: string): 
  { newConfig: string; message: string };
export function commandInspect(name: string, registry: PackRegistry): string;
export function commandOverride(path: string, enabled: EnabledPacks, force: boolean):
  { sourcePath: string; targetPath: string } | { error: string };
export function commandValidate(name: string | null, registry: PackRegistry): ValidationReport;
export function commandNew(name: string): { files: Array<{ path: string; content: string }> };
```

### 4.5 `src/context/registry.ts`

**职责**：加载 Bounded Context 定义，合并 Resolution_Order。

核心签名：

```ts
export async function loadContexts(
  enabledPacks: EnabledPacks,
  fs: FileSystem = realFs,
): Promise<ContextRegistry>;
```

实现要点：
- 遍历 `.forge/custom/contexts/*.md` 和每个 enabled pack 的 `contexts/*.md`
- 解析 frontmatter（用 `yaml` 库）
- Custom_Layer 同名 context 覆盖 pack 版本
- 返回时按名称字母序
- 同时加载 `_map.yaml`（见 `src/context/map.ts`）

### 4.6 `src/context/map.ts`

**职责**：加载和合并 `_map.yaml`。

```ts
export async function loadContextMap(
  enabledPacks: EnabledPacks,
  fs: FileSystem,
): Promise<ContextMapEntry[]>;
```

合并规则（R5.5）：同 `source+target` 边，Custom > 先声明 pack > 后声明 pack。

### 4.7 `src/glossary/registry.ts`

**职责**：加载术语表。

```ts
export async function loadGlossary(
  enabledPacks: EnabledPacks,
  fs: FileSystem = realFs,
): Promise<GlossaryRegistry>;
```

实现要点：
- 遍历 `.forge/custom/glossary/*.md` 和每个 enabled pack 的 `glossary/*.md`
- 文件名即 context 名（`folio.md` → context `folio`，特殊值 `_shared.md`）
- 解析每个文件的多个 `## <Term>` 段
- 每条入口含 `context`、`term`、`definition`、`aliases`、`updated`、`source`
- **向后兼容**（R6.5）：若 `enabledPacks` 为空且不存在任何 `.forge/custom/glossary/`，降级到加载 `.forge/glossary.md` 为 `_shared` context

### 4.8 `src/glossary/mismatch.ts`

**职责**：检测跨 Context 术语误用。

```ts
export function detectContextTermMismatch(
  text: string,
  currentContext: string,
  registry: GlossaryRegistry,
): Array<{ term: string; usedContext: string; definedIn: string[] }>;
```

算法：
1. Tokenize text（按词边界 + Chinese 处理，复用项目已有的 tokenizer 或新建轻量版）
2. 对每个 token，查 `registry.byTerm.get(token)`
3. 若该 term 只在**其他 context** 定义（不含 `_shared`、不含 `currentContext`），记为 mismatch

### 4.9 `src/spec-leak-detector.ts`

**职责**：扫描 spec 文本中的实现细节泄露。

```ts
export function detectSpecLeak(
  specText: string,
  filePath: string,
  bannedRegistry: BannedPatternRegistry,
  glossary: GlossaryRegistry,
  specContext: string,   // 当前 spec 所属 context（从 spec frontmatter 读），缺省为 "_shared"
): LeakFinding[];
```

实现要点：
- 按行遍历 specText
- 跳过 fenced code block（`\`\`\`...\`\`\``，维护 in_code_block 状态）
- 对每个 prose/Gherkin 行，对每个 banned pattern 尝试匹配
- 字面量模式使用词边界包裹（TS regex `\b<literal>\b`，Chinese 用空格/标点边界）
- Regex 模式直接编译
- 命中后检查 glossary 白名单：若 `matchedTerm` 在 `glossary.byTerm` 且某条定义 context 为 `specContext` 或 `_shared`，则不 emit finding（R7.5）
- 输出 `LeakFinding[]`，按 line 排序

### 4.10 `src/scenario-linter.ts`

**职责**：校验 Gherkin scenarios 的格式规则。

```ts
export function lintScenarios(
  specText: string,
  filePath: string,
  options?: { additionalRules?: ScenarioRule[] },
): LintFinding[];
```

默认规则（R8.2）：
- `SCN001`: 句号结尾
- `SCN002`: 每个 Scenario 至少 1 Given/1 When/1 Then
- `SCN003`: THEN 外部可观察（禁止 `database contains`、`table rows`、`variable equals`、`private field` 等，清单可由 pack 扩展）
- `SCN004`: Scenario 标题 kebab-case 或中文

`additionalRules` 允许 pack 提供 `packs/<pack>/lint-rules/scenarios.json`，合并到 default rules。

### 4.11 SKILL 集成点

#### `skills/forge-pack/SKILL.md`（新）

新增 skill，主体 ≤120 行，包含 Overview / 7 个子命令使用说明 / Execution Flow。不详述算法（algorithm 放在 `src/pack/commands.ts`）。

#### `skills/forge-spec/SKILL.md` 扩展

在现有 `Step 2: Review` 的 self-check 表中追加第 7 项 `Spec Leak Check`，引用 `references/spec-leak-detector.md`（新增 reference 文件）。集成调用 `detectSpecLeak()`。

#### `skills/forge-plan/references/atomic-task-format.md` 扩展

在 Run 步骤格式中追加 `Expected:` 行的规范说明 + 3 种合法形式 + 示例。

#### `skills/forge-build/references/tdd-rules.md` 扩展

新增章节 `## RED Verification Gate`，详述三段证据字段 + 2 个示例。

#### `skills/forge-review/SKILL.md` 扩展

Layer 1（spec-check）执行说明中追加"调用 `detectSpecLeak()` 对 spec 再扫一次，防止开发过程倒灌"，作为 P1 findings 注入主合并管线。

## 5. Execution Flow

### 5.1 Forge 启动 / 首次调用 Pack-aware skill

```
1. 读取 <reposRoot>/packs/*/pack.yaml
   → loadPackRegistry() → PackRegistry
   
2. 读取 .forge/config.md frontmatter.packs
   → parseEnabledPacks(config, registry) → EnabledPacks
   
3. 对每个需要的引擎按需延迟加载：
   - forge-spec 需要 glossary/leak detector → loadGlossary() + loadBannedPatterns()
   - forge-plan 需要 scenario linter → loadScenarioRules()
   - forge-review Layer 1 需要 leak detector → 同 forge-spec
```

懒加载：引擎数据只在需要时加载，启动时不付出成本。PackRegistry 本身轻量（只读 manifest），可以启动时一次性加载。

### 5.2 `/forge pack enable pms` 交互流程

```
1. 读 packs/*/pack.yaml → PackRegistry
2. 验证 "pms" 在 registry 中
   → 若否，退出并打印 "available packs: ..."
3. 读 .forge/config.md
4. 调 commandEnable("pms", config, registry)
   → 返回 newConfig（追加到 frontmatter packs: 列表）
5. 写回 .forge/config.md
6. 打印 "✅ pack enabled: pms"
```

Idempotent：已启用则直接返回 no-op。

### 5.3 `/forge spec` lock 前的 leak 检查

```
现有 7 项 self-check（Testability / Boundary / Human Readability / Brownfield / Anti-drift 
/ Two-part Structure / Reversibility）

→ 新增第 7 项：Spec Leak Check
  1. 加载 enabledPacks (lazy)
  2. 加载 bannedRegistry = union(customLayer banned, pack banned)
  3. 加载 glossary
  4. 读 spec frontmatter.context（无则 "_shared"）
  5. findings = detectSpecLeak(specText, filePath, bannedRegistry, glossary, specContext)
  6. 若 findings.length > 0，阻断 lock；打印每条 finding 的 file:line + original + matched_term + suggested
  7. 若 == 0，self-check 通过
```

## 6. Testing Strategy

### 6.1 Unit Tests（Vitest）

每个 pure function 模块配对 `.test.ts`，覆盖：
- `pack/loader`: 缺字段 / 坏 yaml / 重名 / 正常
- `pack/resolver`: 空 enabled / single pack / multi-pack / with custom / not-found
- `context/registry`: 空 / single layer / multi-layer override
- `glossary/registry`: 回退到单文件 / 分 context / custom override
- `glossary/mismatch`: 同 context 不报 / 跨 context 报 / `_shared` 不触发
- `spec-leak-detector`: 代码块豁免 / glossary 白名单 / 字面量 vs regex / 空 banned 空结果
- `scenario-linter`: 4 条默认规则每条正反例 / additionalRules 合并

### 6.2 Property Tests（fast-check）

- `pack/resolver`: Resolution_Order idempotence（同输入同输出）
- `pack/resolver`: Custom 总是比 Pack 优先（∀ path, resolve with custom = custom path）
- `context/registry`: merge 顺序稳定（不依赖文件系统迭代顺序）
- `glossary/registry`: 同 term 不同 context 不冲突
- `spec-leak-detector`: 空 banned 空结果（∀ spec, ∅ banned → ∅ findings）
- `spec-leak-detector`: glossary 覆盖单调（增加 glossary 条目只会减少 findings，不会增加）
- `scenario-linter`: 全通过的 scenarios 经过 linter 后仍全通过（identity on clean input）

### 6.3 Integration Tests

- `test/pack/zero-pack-invariant.test.ts`：完整 forge-spec lock + forge-plan approve + forge-build TDD + forge-review 全流程，`packs:` 为空，断言行为与 Sprint 1 前 snapshot 一致
- `test/pack/command-e2e.test.ts`：`pack list` / `enable` / `inspect` / `override` / `validate` / `new` 每个子命令端到端
- `test/pack/custom-override.test.ts`：创建假 pack + custom 覆盖 glossary，验证 resolver 先命中 custom

### 6.4 Fixtures

- `test/pack/fixtures/packs/demo-empty/` — 空 pack（只有 pack.yaml）
- `test/pack/fixtures/packs/demo-full/` — 所有 extends 类别都有文件
- `test/pack/fixtures/packs/demo-bad-manifest/` — 缺必填字段
- `test/pack/fixtures/custom/` — custom 覆盖层示例

## 7. Security Considerations

- **Pack 加载不执行任意代码**：只读 YAML 和 Markdown，不 `require` / `import` pack 目录下的 JS/TS（lint-rules 除外，延后到实际使用时加载并在沙箱中评估，超出本 spec 范围）
- **路径穿越防护**：`pack/resolver` 使用 `path.resolve` + 前缀校验，确保 resolved 路径位于 `packs/<name>/` 或 `.forge/custom/` 下，不越界
- **YAML 安全解析**：使用 `yaml` 库的 safe parse 模式（默认），不允许任意 JS 对象实例化

## 8. Migration Path

### 8.1 既有 `.forge/glossary.md` 向后兼容

R6.5 要求：`enabledPacks = []` 且无 `.forge/custom/glossary/` 时，自动降级读 `.forge/glossary.md`，视作 `_shared` context 下的术语表。用户不需要迁移。

### 8.2 既有 plan 文件的 Expected Output

R10.6 要求：legacy plan 没有 Expected 字段时，self-check 只 warn 不 error；用户可渐进式补齐。

### 8.3 `.forge/specs/` 已有 specs

已有 specs 的 scenarios 可能违反 SCN001-SCN004，提供迁移窗口：R8.4 只对新 lock 的 spec 强制，已 locked specs 豁免（通过 frontmatter `lint_grandfathered: true` 标记）。

## 9. Open Questions / Deferred

- **Pack dependency resolution**：`pack.yaml` 的 `depends_on` 字段已设计，但 v1 不实现自动拓扑排序启用；手动按正确顺序声明即可。
- **Pack registry 远程同步**：单仓库下不需要，未来如果支持外部 pack（Git/npm）再引入。
- **Lint rules 的 JS 执行**：`packs/<pack>/lint-rules/*.ts` 的动态加载暂不实现，Sprint 2 PMS Pack 引入 Money Lint 时再一并设计沙箱方案。
- **Scenario Linter 的 Chinese 分词**：SCN004（标题规则）的 Chinese 检测用简单启发式（若包含 CJK 字符则通过），未引入分词库。
