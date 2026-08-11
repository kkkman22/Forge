---
date: 2026-06-27
topic: packs-plugin-distribution
status: pending-confirmation
tier: full
slice: "A'（packs 分发）— 切片 A（示例领域代码）的前置阻塞"
triggered_by: "切片 A decide 确认阶段发现：plugin 用户（主推途径）连 packs/ 都拿不到，/forge init --pack pms 是谎言式缺陷"
related_decisions:
  - ".tinkerman/decisions/2026-06-27-domain-example-reference-impl.md（切片 A，被本切片阻塞）"
perspectives:
  product: "low"
  architect: "low"
  security: "medium"
critic_verdict: "pass（附条件：check-bundle-sync 更新 + .test.ts 排除为切片内必做）"
---

# 决策：packs/ 进 plugin bundle 分发（切片 A'）

## 0. 背景：一个现存的谎言式缺陷

切片 A（示例领域代码）decide 确认阶段核实用户获取路径时发现：**pms pack 对主推的 plugin 安装用户完全失效**。

- `scripts/build-dist.sh:118-122` 拷 skills/agents/commands/hooks/templates 进 bundle，**唯独无 `cp -r packs`**（全文 grep 零命中）。
- `init.sh:1254-1255`（bundle 版）显式兜底："Pack 未找到于 packs/ 目录。配置已记录，但 Pack 功能将不可用直到安装"。
- 但 init.sh:129 帮助文本 + :16 用法示例**都宣传 `--pack pms`**——接口宣称能力，bundle 却不含 pack，必触发 warn。这是**契约违反/接口撒谎**，不是"功能没人用"。

| 用户类型 | `/forge init --pack pms` 结果 |
|---------|------------------------------|
| plugin 安装（主推，README:28） | ❌ warn"不可用"+ 空配置（谎言） |
| git clone | ✅ 正常 |
| npm（files: dist/src/） | ❌ packs 不在包内 |

**修复必要性**（Critic 裁决）：与使用率无关。判断标准是"被宣称的能力是否诚实"。即便 <5% 用户用 pms，接口宣称了就必须诚实交付。修复让谎言变诚实。

本切片是切片 A（示例领域代码）的前置——示例参照价值依赖用户能拿到 pack。

## 1. Product 视角（风险：低）

**高价值，应优先于示例领域代码**。`/forge init --pack pms` 是谎言式缺陷，用户照文档操作得到静默降级，比"功能不存在"更糟（信任损耗）。

**苏格拉底追问**：plugin 用户里多少是酒店行业（pms 极度垂直）？可能 <5%。全量打包给 95% 用户塞 432K + 认知噪音。**但这个质疑回答"值不值得优化分发形态"，不回答"要不要修缺陷"——修缺陷与受众比例正交。**

**分发形态**：推荐全量打包（pms 392K + sample 40K ≈ 432K，相对 bundle 仅 +15%；按需下载复杂度远超节省）。建议 bundle 附 pack 清单 README 让非酒店用户知道可忽略。**建议加 --pack 使用埋点**，下次分发决策有数据。

## 2. Architect 视角（Design It Twice，风险：低）

### 方案对比
- **方案 A（强推荐）— 全量打包**：build-dist.sh 加 `cp -r packs` 进 bundle。体积 +432K 可忽略、离线可用（init 常在 CI/air-gapped，这是硬约束）、1 行改动。
- 方案 B — 清单+按需拉取：bundle 仅含 INDEX，init 时从 GitHub 拉。引入 fetch/版本解析/鉴权/校验/失败恢复 5 个新 seam，且**破坏离线**。推迟到 packs >10 个或单 pack >10MB 再启用。

### FORGE_ROOT 定位（无需改 init.sh）
packs 放 `${CC_BUNDLE}/packs`。plugin 模式 detect_forge_root 情况 0 返回 CLAUDE_PLUGIN_ROOT（bundle 含 agents/），故 `${FORGE_ROOT}/packs/${pack_name}` 自动命中。init.sh 零改动。graceful degradation（:1254 warn）已就位。

### 可运行代码
源码直拷（非预编译）——必须在用户 tsconfig 下编译、是参考实现用户会改。dist-manifest.json 不必加 packs key（同级 skills/agents 也是 hardcoded cp -r 非 manifest 驱动）。

### 关键风险
- Pack↔Forge 版本耦合（中，v1 接受）
- **pms-marriott-sample 不该进 bundle**（白名单只拷正式 pack）
- plugin.json 无需改（packs 由 init.sh 消费，非 CC runtime 概念）

## 3. Security 视角（风险：中，pass-with-notes）

**STRIDE**：
- Tampering 高：business-day-clock.ts 可执行 TS 进用户本地编译执行。通读 264 行纯 Intl.DateTimeFormat 计算，无 eval/Function/child_process/网络/文件 IO，逻辑干净。**但代码未经审计/签名流程**。
- Info Disclosure 中：lint-rules target_globs 允许任意 glob，恶意构造可匹配 `**/.env*` 泄露敏感文件（潜在面，非本切片引入）。
- 按需下载方案高：MITM+投毒+无校验三重风险。

**P0**：禁止运行时按需从 GitHub 拉 pack（采纳方案 A 自动满足）。
**P1**：plugin.json 声明 contains_executable_code；lint glob 白名单校验——**P1 移出本切片**（现存独立安全债，单开 ticket）。

**结论**：pass-with-notes。bundle 静态分发路径风险可控。

## 4. Critic 交叉审视（裁决：pass，附条件）

### 过早共识检验
三视角选 A 非共识泡沫。缺陷本质是契约违反，修复与使用率正交。product 的 <5% 质疑对**范围边界**有用——不借修复之名加 PMS 垂直化增强。

### sample pack 排除（architect 提出，另两视角漏了）
**裁决排除 pms-marriott-sample**。理由：sample 是教学素材非运行时能力；含具体公司名（marriott）进通用 bundle有命名/许可观感问题。用**显式 allowlist**（packs/pms）非 denylist，避免未来新 sample 漏配。

### 盲区补全（三视角遗漏，部分为切片内必做）
1. **check-bundle-sync.mjs 更新 = 前置必做**：现只校验 runtime scripts，加 packs 断言防 dist/packs 漂移。
2. **.test.ts 排除**：business-day-clock.test.ts 进 bundle 无意义，cp 时排除 `**/*.test.ts`。
3. **version 耦合缓解**：bundle/VERSION 旁加 packs/manifest.json 记录所含 pack version，init.sh 加 version 校验（低成本漂移围栏）。
4. **builder 脚本定位**：改动点在 build-dist.sh（builder），非 check-bundle-sync（校验器）。

## 5. 综合决策

### 分发方案
- **方案 A 全量打包**：build-dist.sh 加 `cp -r packs`（allowlist 仅正式 pack）
- **排除**：pms-marriott-sample（教学素材）+ `**/*.test.ts`（测试文件）
- **FORGE_ROOT**：零改动（packs 放 bundle/packs，detect_forge_root 已命中）

### 完整性保障（切片内必做）
- check-bundle-sync.mjs 加 packs 断言（防 dist/packs 漂移）
- bundle/VERSION 旁加 packs/manifest.json（含 pack version，init.sh version 校验）

### 安全
- P0 自动满足（方案 A 不触网，无按需下载）
- P1（lint glob 白名单）移出本切片，单开安全 hardening ticket

### 埋点（采纳 product）
- --pack 使用写入 .forge 日志，为下次分发决策攒数据

### 范围边界（严守）
- 只做：修缺陷（谎言变诚实）+ 打包 + 校验 + 埋点
- **不做**：PMS 垂直化增强、欢迎横幅重写、plugin.json 改动、按需下载

## 6. Veto 否决记录
无视角行使否决权。

## 7. 切片内任务清单（spec 阶段细化）
1. build-dist.sh 加 `cp -r packs`（allowlist 排除 sample + .test.ts）
2. check-bundle-sync.mjs 加 packs 断言
3. packs/manifest.json 生成（记录含 pack version）
4. init.sh 加 pack version 校验（bundle 内 pack vs 期望）
5. bundle 内加 pack 清单 README（让非目标领域用户知道可忽略）
6. --pack 使用埋点（写 .forge 日志）
7. 测试：bundle 含 packs、init.sh 在 plugin 场景定位到 pack、sample/test.ts 被排除

## 8. 开放问题（spec 阶段解决）
- packs/manifest.json 的 schema（复用 pack.yaml version 还是独立）
- 埋点日志格式与现有 tool-health.md 的关系
- check-bundle-sync 的 packs 断言用 hash 还是存在性
