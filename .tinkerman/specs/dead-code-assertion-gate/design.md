---
feature: dead-code-assertion-gate
layout: design
created: 2026-06-26
tier: full
work_nature: feature
brownfield: true
---

# Design — Dead-Code Assertion Gate

## Overview

本设计针对 requirements.md 的 4 个 REQ 提供架构级方案。核心原则：**fail-open（有引用即阻断删除）**、**四维扫描**、**零新增依赖**（用 grep 扫描器，不引入 madge）。

设计分两类工作：
- **纯新增工具**（REQ-01/02/04）：新 check 脚本 + 接入 check 链 + 回归测试——无对外行为变化。
- **文档/约定**（REQ-03）：build SKILL + evolved-rules Infra_Ref 更新——引导 agent 在删除前主动调用。

---

## Current State（brownfield）

### T-01 盲区的精确结构（本 spec 要堵的洞）

判定 `src/state-machine/` 为死代码的**错误推理链**：

```
grep -rln "from.*state-machine" src/ scripts/   →  0 命中
        ↓ （误判：src 内部无 import = 孤岛）
"零引用确认" → 写入 spec REQ-01 → 准备删除
        ↓ （build 阶段才打破）
test/pms-pack/integration.test.ts import 公开 API  ← 漏看
packs/pms/state-machines/*.yaml 被加载            ← 漏看
```

**漏掉的两个维度**：

| 维度 | T-01 漏看的原因 | 实证 |
|------|----------------|------|
| test/ 公开 API import | grep 只扫 src/，且 `src/state-machine` 不在 package barrel `src/index.ts`（145 export）里，看似"未暴露" | test 直接 import 模块 barrel `src/state-machine/index.ts:6-16`（4 value export，标 `@public`） |
| packs/ 数据依赖 | 数据目录是运行时 `readFileSync` 加载，静态 import graph 看不到 | `test/pms-pack/integration.test.ts:26,101-118` 读 `packs/pms/state-machines/` 4 个 yaml；`packs/pms/pack.yaml:11` manifest 声明 |

**关键洞察**：`check-public-api.mjs` 只管 package barrel（`src/index.ts`），不判定死代码；一个模块即使不在 package barrel，仍可通过**模块 barrel**（自己的 index.ts）被 test/packs 消费。死代码判定不能只看"是否在 package barrel"。

### 现有工具盘点（无可复用，但有可借鉴模式）

- **无 madge / dependency-cruiser**（`package.json:50-63` devDeps 确认）。madge 在项目里仅出现在 spec 计划文本（T-02 plan.ts 拆分设想），未安装。
- `check-public-api.mjs`：只扫 src/，遍历 `@public` 注解对照 barrel。**其 `walkDir`(:56-66) + 符号提取正则 `export\s+...\s+(\w+)`(:83-95) 可直接借鉴**用于提取模块公开 API。
- `check-dist-sync.mjs`：只对照 src↔dist 文件存在性（`git ls-files`），不分析引用。**其 skip 惯例（:92-108，env + commit-msg）可借鉴**。
- `check-deps.mjs`：只查 package.json 依赖的 license/typoquatting，不查模块引用。

### `npm run check` 链现状（20 项，`package.json:29`）

结构守护类 check（check-public-api #5、check-dist-sync #15）排链中后部，均为 exit 1 阻断型。本脚本接入位置：链尾（#21）。

---

## Proposed Change

### REQ-01 四维扫描实现

新建 `scripts/check-unused-module.mjs`，接口 `node scripts/check-unused-module.mjs <module-path> [--help]`。

**模块路径解析**：接受 `src/state-machine/`（目录）或 `src/foo.ts`（文件）。目录时扫描该目录所有 .ts 的公开 API；文件时扫描该文件的 export。

**四维扫描算法**（借鉴 check-public-api walkDir + 正则）：

```js
// 第 0 步：提取目标模块的公开 API 符号集（模块 barrel index.ts 或文件本身）
const moduleExports = extractExports(resolveModuleEntry(modulePath));  // {name → file}

// 维度 (a)(b): src/ + scripts/ 的 import 路径引用
const srcHits = scanImports("src", modulePath, excludeSelf=true);
const scriptsHits = scanImports("scripts", modulePath);

// 维度 (c): test/ 通过公开 API 使用
//   grep test/ 是否 import 模块路径 OR 引用任何 moduleExports 的符号名
const testApiHits = scanTestPublicApiUsage("test", modulePath, moduleExports);

// 维度 (d): packs/rules 数据目录引用（启发式）
const dataHits = scanDataDirUsage(modulePath, moduleExports);

const allHits = [...srcHits, ...scriptsHits, ...testApiHits, ...dataHits];
if (allHits.length > 0) { reportAndExit1(allHits); }  // fail-open: 有引用即阻断
else { console.log("no references found"); process.exit(0); }
```

**各维度扫描细节**：

- **scanImports(dir, modulePath)**：walkDir 收集 `dir/**/*.ts|mjs`，正则匹配 `from\s+["'].*<moduleName>` 或 `require\(.*<moduleName>`。排除模块自身目录的内部互引。
- **extractExports(entry)**：复用 check-public-api.mjs:83-95 的正则提取 value export（function/const/class/enum）名；目录模块优先读 `index.ts`。
- **scanTestPublicApiUsage(testDir, modulePath, exports)**：双重判定——(1) test 文件 import 路径含模块名；(2) test 文件引用 exports 中任一符号名（word boundary 匹配，避免子串误报）。
- **scanDataDirUsage(modulePath, exports)**（**第四维，启发式**）：
  1. 从 `src/pack/types.ts` 提取 category 字符串集（如 `"state_machines"`、`"glossary"`、`"banned_patterns"`）。
  2. 反推模块名 ↔ category 的关联（如 `state-machine` ↔ `state_machines`，通过命名约定或显式映射表）。
  3. grep `packs/*/pack.yaml` manifest 是否声明该 category；grep `test/` 是否 `readFileSync` 指向 `packs/<category>/`。
  4. **启发式边界**（见 Open Question）：第四维无法 100% 精确（数据目录是运行时加载），采用"宽匹配 + 报告供人工确认"策略。

**第四维的 T-01 验证**：对 `src/state-machine/`，第四维应命中——`src/pack/types.ts:22` 的 `"state_machines"` category + `packs/pms/pack.yaml:11` 声明 + test `readFileSync` 读 `state-machines/` 目录。

### REQ-02 接入 check 链 + skip

- `package.json:29` 的 `check` 链末尾追加 `&& node scripts/check-unused-module.mjs`。
- **无参数行为**：脚本检测到无 `<module-path>` 参数时，输出"工具就位；build 阶段删除前显式调用"并 `exit 0`（避免全库扫描误报，INV-4）。
- **skip 惯例**（对齐 check-dist-sync.mjs:92-108）：
  - `process.env.FORGE_SKIP_UNUSED_CHECK === "1"` → warn + exit 0。
  - commit message 含 `[unused-check-skip]` → warn + exit 0。
  - warn 必须 loudly（`⚠️ unused-module check SKIPPED ...`），让 reviewer 注意。

### REQ-03 build 阶段触发约定

- `skills/forge/lib/build/instructions.md`（或 Pre-build Checks 段）新增条目："删除 src 模块/文件前，必须运行 `node scripts/check-unused-module.mjs <target>` 验证四维无引用；exit 1 时先迁移消费者或撤销删除主张。"
- **evolved-rules 处理**：R3（Pack/Loader 运行时验证）已 14/15 满额。本 spec **优先更新 R3 的 Infra_Ref** 追加本脚本，不新增 R15（保留名额）。R3 精神（"静态 grep 看不到 pack 格式断层"）与本机制（"静态 import 看不到 pack 数据依赖"）同源。
- skip 滥用防护：约定明确 `[unused-check-skip]` 仅限紧急 hotfix，PR 须说明理由（对齐 dist-sync-guard 的 `[dist-sync-skip]` 惯例）。

### REQ-04 T-01 反向回归 fixture

- `test/check-unused-module.test.ts`：
  - **state-machine 非死代码**：`execFileSync(node, [script, "src/state-machine/"])` 断言 `status !== 0` 且 stderr/stdout 含 test/packs 引用点。
  - **真死代码 fixture**：在 tmpdir 构造 `src/fake-dead/`（无任何引用），断言 exit 0。
  - **skip 机制**：设 `FORGE_SKIP_UNUSED_CHECK=1` 断言 exit 0 + warn。
  - **--help**：exit 0 + 含 usage。

---

## Component Interfaces

| 组件 | 对外接口 | 变化 |
|------|---------|------|
| `scripts/check-unused-module.mjs` | CLI: `<module-path>` / `--help`；exit 0(无引用) / 1(有引用) / 0(skip) | **新增** |
| `package.json` `check` script | 链尾追加 `&& node scripts/check-unused-module.mjs` | **追加 1 项** |
| `skills/forge/lib/build/instructions.md` | 新增"删除前验证"条目 | **文档追加** |
| `.tinkerman/knowledge/evolved-rules.md` | R3 的 Infra_Ref 追加本脚本 | **Infra_Ref 更新** |

---

## Reversibility

| REQ | 回滚动作 | 风险 |
|-----|---------|------|
| 01 | 删除 `check-unused-module.mjs` | 极低（纯新增工具） |
| 02 | 从 check 链移除本脚本 | 极低（链恢复原状） |
| 03 | 回退 build SKILL 条目 + evolved-rules Infra_Ref | 低（文档） |
| 04 | 删除测试 | 极低 |

本 spec 全程**无对外行为变化**（纯新增工具 + 文档），回滚零风险，不涉及安全语义。

---

## Testing Strategy

- **REQ-01**：单元测试各 scan 函数（scanImports/extractExports/scanTestPublicApiUsage/scanDataDirUsage），用 fixture 目录。
- **REQ-02**：集成测试——`npm run check`（无参数跳过）全绿；skip env/commit-msg 用例。
- **REQ-03**：文档审查（build SKILL grep 命中；evolved-rules Infra_Ref 含脚本路径）。
- **REQ-04**：**核心回归**——state-machine 被判非死代码（堵 T-01 盲区）。

全部 RED→GREEN→REFACTOR（Forge §2.1 TDD 铁律）。

---

## Open Questions

1. **第四维（packs 数据依赖）的判定边界**：是精确映射（维护 `模块名 ↔ category` 显式表）还是启发式（命名约定推断 + 宽匹配）？
   - 精确映射：可靠但需维护（新 pack category 要更新表）。
   - 启发式：零维护但有 false positive（报告供人工确认）。
   - **建议**：先启发式（命名约定：`state-machine` ↔ `state_machines`，`glossary` loader ↔ `glossary` category），false positive 由"报告引用点供确认"缓解；若误报频繁再升级为显式映射表。须在 build 阶段 T-01 验证后定。
2. **evolved-rules R3 Infra_Ref 更新 vs 新增 R15**：R3 已 14/15 满额。本 spec 倾向更新 R3 Infra_Ref（不占名额），但若 R3 的"loader 返回空"语义与本机制"删除前验证"差异过大，可能需新增 R15（占用最后名额）。build 阶段评估。
3. **是否接 git pre-commit hook**：本 spec 不做（用 build SKILL 约定）。hook 作为后续 spec——若 build 阶段约定被频繁绕过，再考虑 hook 强制。
