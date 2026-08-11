---
status: completed
feature: packs-plugin-distribution
layout: requirements
created: 2026-06-27
updated: 2026-06-29
tier: full
work_nature: feature
brownfield: true
import_source: ".tinkerman/decisions/2026-06-27-packs-plugin-distribution.md"
related_adrs:
  - "待生成（spec lock 后由 decide→ADR 流程）"
related_decisions:
  - ".tinkerman/decisions/2026-06-27-packs-plugin-distribution.md"
health:
  score: 0
  verdict: "pending"
---

# Requirements — Packs Plugin Distribution（切片 A'）

## 目标

修正一个现存的**谎言式缺陷**：`/forge init --pack pms` 对 plugin 安装用户（README 主推途径）完全失效——`scripts/build-dist.sh` 从不把 `packs/` 拷进 plugin bundle，但 init.sh 帮助文本宣传 `--pack pms` 并在 pack 缺失时静默 warn"功能不可用"却照常写配置。

修复后，plugin 用户 `claude plugin install forge` + `/forge init --pack pms` 能真正拿到 pms pack 数据，pack 机制对主推分发途径诚实工作。

本切片是切片 A（示例领域代码）的前置阻塞——示例参照价值依赖用户能收到 pack。

## 非目标

- **不做**运行时按需下载（从 GitHub 拉 pack）——security P0 禁止；全量打包即可
- **不做** PMS 垂直化增强、欢迎横幅重写、plugin.json 改动
- **不做** lint glob 白名单安全加固（P1，单开 ticket）
- **不做**示例领域代码（切片 A）或领域知识贯穿全流程（切片 B）
- **不做** pack 独立发版/registry（推迟到 packs >10 个或单 pack >10MB）

## 全局不变式（所有 REQ 必须满足，任一违反 = 阻断 ship）

| ID | 不变式 | 验证 |
|----|--------|------|
| INV-1 | git clone 用户行为不变（packs/ 仍在仓库，init.sh 仍能定位） | 现有 init 流程测试全绿 |
| INV-2 | plugin bundle 体积增长 ≤ 1MB（全量 pack 打包后） | bundle 体积断言 |
| INV-3 | 不引入运行时网络请求（全量静态分发，无 fetch/curl） | 代码审查 + grep 无网络调用 |
| INV-4 | 现有 check-bundle-sync / check-dist-sync / npm run check 不回归 | 全绿 |
| INV-5 | 每个改动验证：`npx tsc --noEmit && npx vitest run && npm run check` | bash exit 0 |

---

## REQ-01: build-dist.sh 拷贝正式 pack 进 plugin bundle

**问题复现**：`scripts/build-dist.sh:118-122` 拷 skills/agents/commands/hooks/templates 进 `dist/claude-code/bundles/forge/`，**无 `cp -r packs`**。plugin 安装后 bundle 无 packs/，init.sh:1254 的 `${FORGE_ROOT}/packs/${pack_name}` 必落空。

**Requirement**：
- WHEN 执行 `bash scripts/build-dist.sh` THEN 脚本 SHALL 将正式 pack 拷贝到 `${CC_BUNDLE}/packs/`（与 skills/agents 同级）。
- THE 拷贝 SHALL 用**显式 allowlist**（当前仅 `packs/pms`），排除 `packs/pms-marriott-sample`（教学素材，含具体公司名，不该进通用 bundle）。
- THE 拷贝 SHALL 排除 `**/*.test.ts`（测试文件进 bundle 无意义，增加噪音；如 `packs/pms/utils/business-day-clock.test.ts`）。
- THE 可运行源码（如 `business-day-clock.ts`）SHALL 以源码形态拷贝（非预编译）——它是参考实现，需在用户 tsconfig 下编译，用户会改。

**Verify-By**: `bash:contract`
**Evidence**：`scripts/build-dist.sh` 含 packs 拷贝段；构建后 `dist/claude-code/bundles/forge/packs/pms/` 存在且含 pack.yaml + contexts/ + state-machines/ + scenarios/ + utils/business-day-clock.ts；不含 pms-marriott-sample；不含 *.test.ts。

---

## REQ-02: plugin bundle 含 pack 清单 README

**问题**：全量打包后，非酒店行业用户（可能 95%）会在 bundle 里看到 pms pack 产生认知噪音。需让用户明确"pms 是可选领域示例，可忽略"。

**Requirement**：
- WHEN build-dist.sh 完成 pack 拷贝 THEN SHALL 在 `${CC_BUNDLE}/packs/README.md` 生成 pack 清单说明。
- THE README SHALL 列出所含 pack（名称 + 一句话定位 + 是否含可运行代码）。
- THE README SHALL 明确标注"pack 是可选领域知识，非目标行业可忽略"。
- THE README SHALL 说明可运行代码（如 business-day-clock.ts）需用户项目 tsc 编译接入。

**Verify-By**: `manual`
**Evidence**：`dist/claude-code/bundles/forge/packs/README.md` 存在，含 pack 清单 + 可忽略说明 + 可运行代码提示。

---

## REQ-03: packs/manifest.json 记录所含 pack 元数据（version 漂移围栏）

**问题**：pack 与 Forge 版本耦合（pack 随 Forge release）。需低成本围栏防止 bundle 内 pack 与期望漂移。注：`pack.yaml` 当前**只有 `forge_min_version`，无 pack 自身 version 字段**（决策文档此处理解有误，本 spec 修正）。

**Requirement**：
- WHEN build-dist.sh 拷贝 pack THEN SHALL 在 `${CC_BUNDLE}/packs/manifest.json` 生成清单，记录每个所含 pack 的 `name` + `forge_min_version`（读自各 pack.yaml）+ `bundled_at`（构建时间戳 ISO8601）。
- THE manifest.json SHALL 作为 pack 漂移检测的单一真相源（bundle 内 pack 集合的权威记录）。
- WHEN init.sh 启用某 pack THEN SHALL 读取 manifest.json 校验该 pack 在清单中（清单无此 pack → warn 提示"pack 未随此 Forge 版本分发"）。

**Verify-By**: `vitest:unit` + `bash:contract`
**Evidence**：`dist/claude-code/bundles/forge/packs/manifest.json` 存在且 schema 合法（含 name/forge_min_version/bundled_at）；init.sh 的 version 校验逻辑 + 单测。

---

## REQ-04: check-bundle-sync.mjs 增加 packs 完整性断言

**问题**：`scripts/check-bundle-sync.mjs` 当前只校验 hooks.json 引用的 scripts 是否在 bundle（Layer 1），**完全不校验 packs/**。packs 拷贝漂移无人拦。

**Requirement**：
- WHEN 执行 `node scripts/check-bundle-sync.mjs` THEN 脚本 SHALL 增加一层 packs 完整性校验：验证 `${CC_BUNDLE}/packs/` 下每个期望 pack（读自 packs/manifest.json 或硬编码 allowlist）都存在且非空。
- WHEN 期望 pack 缺失或为空 THEN 脚本 SHALL exit 1 并报告缺失 pack。
- THE 校验 SHALL 遵循现有 skip 惯例（FORGE_SKIP_BUNDLE_SYNC=1 或 [bundle-sync-skip]）。

**Verify-By**: `vitest:unit` + `bash:contract`
**Evidence**：check-bundle-sync.mjs 含 packs 校验逻辑；故意删 bundle 内 pack → exit 1；正常 → exit 0。

---

## REQ-05: init.sh 在 plugin 场景正确定位并校验 pack

**问题**：init.sh:1254 用 `${FORGE_ROOT}/packs/${pack_name}` 定位 pack。plugin 场景 FORGE_ROOT=CLAUDE_PLUGIN_ROOT（bundle 根），REQ-01 让 bundle 含 packs/ 后此路径命中。但需补 manifest 校验。

**Requirement**：
- WHEN plugin 用户执行 `/forge init --pack pms` THEN init.sh SHALL 在 `${FORGE_ROOT}/packs/pms` 找到 pack（REQ-01 已拷入）。
- WHEN pack 存在 THEN init.sh SHALL 读 `${FORGE_ROOT}/packs/manifest.json` 校验 pms 在清单中。
- WHEN pack 不在清单或 manifest 缺失 THEN init.sh SHALL warn（保留现有 graceful degradation，不阻断 init）。
- THE git clone 用户场景 SHALL 行为不变（INV-1）——packs/ 在仓库，manifest 校验对 clone 场景同样适用（clone 仓库的 packs/ 无 manifest.json 时跳过校验，warn 提示）。

**Verify-By**: `bash:contract` + `manual`
**Evidence**：init.sh 的 pack 定位 + manifest 校验逻辑；plugin 场景（模拟 CLAUDE_PLUGIN_ROOT）+ clone 场景双路径测试。

---

## REQ-06: --pack 使用埋点（为下次分发决策攒数据）

**问题**：product 视角指出"plugin 用户真会用 pms 吗（<5%）"未经数据验证。修复后应埋点，下次分发决策（如是否按需下载）才有依据。

**Requirement**：
- WHEN 用户执行 `/forge init --pack <name>` 且 pack 成功定位 THEN init.sh SHALL 追加一行使用记录到项目 `.tinkerman/knowledge/tool-health.md`（复用现有运行时日志机制，不引入新文件）。
- THE 记录格式 SHALL 与 tool-health 现有条目一致（时间戳 · 事件类型 · pack 名 · 分发途径 plugin/clone）。
- WHEN 记录失败（如 .tinkerman/ 不可写）THEN SHALL 静默跳过，不阻断 init。

**Verify-By**: `bash:contract`
**Evidence**：init.sh 的埋点逻辑；模拟 --pack 成功 → tool-health.md 含新记录行。

---

## REQ-07: 完整性回归（bundle-sync / dist-sync / npm run check 不回归）

**Requirement**：
- THE 改动 SHALL 不破坏现有 check-bundle-sync（Layer 1 hooks scripts 校验）、check-dist-sync、npm run check 全链。
- THE 改动 SHALL 不破坏现有 bundle 完整性测试（test/contract.test.ts §8 dist bundle completeness）。
- WHEN `npm run check` 运行 THEN SHALL exit 0。

**Verify-By**: `bash:contract`
**Evidence**：`npm run check` 全绿；contract.test.ts bundle 完整性测试通过。

---

## 验收标准（spec 级）

- [ ] 7 个 REQ 全部实现，各自 Evidence 齐全
- [ ] 全局不变式 INV-1 ~ INV-5 在最终 PR 全部满足
- [ ] `npx tsc --noEmit && npx vitest run && npm run check` 全绿
- [ ] **核心修复验证**：模拟 plugin 场景（CLAUDE_PLUGIN_ROOT 指向 bundle），`/forge init --pack pms` 能定位 pack 且不再 warn"不可用"
- [ ] sample pack（pms-marriott-sample）与 *.test.ts 不进 bundle
- [ ] 无运行时网络请求（INV-3）

## 依赖

- 无外部 spec 依赖。
- REQ-03 的 manifest.json schema 依赖 pack.yaml 现有 `forge_min_version` 字段（已存在）。
- REQ-04 的 packs 断言依赖 REQ-03 的 manifest.json 作为期望清单来源。
