---
feature: packs-plugin-distribution
layout: design
created: 2026-06-27
brownfield: true
related_requirements: ".forge/specs/packs-plugin-distribution/requirements.md"
---

# Design — Packs Plugin Distribution（切片 A'）

## 1. 架构概览

### 当前架构（Current State）

```
build-dist.sh
  ├─ cp -r skills    → CC_BUNDLE/skills      ✅
  ├─ cp -r agents    → CC_BUNDLE/agents      ✅
  ├─ cp -r commands  → CC_BUNDLE/commands    ✅
  ├─ cp -r hooks     → CC_BUNDLE/hooks       ✅
  ├─ cp -r templates → CC_BUNDLE/templates   ✅
  ├─ cp scripts/*    → CC_BUNDLE/scripts     ✅ (manifest 驱动)
  ├─ cp dist/src/*   → CC_BUNDLE/dist/src    ✅ (check-frozen + mcp)
  └─ packs/          → ❌ 从不拷贝            ← 缺陷根因
```

`build-dist.sh:118-122`（skills/agents/commands/hooks/templates 五连拷）是 packs 拷贝应插入的位置。

```
init.sh:1254  FORGE_ROOT=$(detect_forge_root)
              # 情况0: CLAUDE_PLUGIN_ROOT 存在且有 agents/ → 返回 plugin 安装目录
              # 情况1/2: script_dir/../agents 或 ~/.claude/skills/forge/agents
              if [[ ! -d "${FORGE_ROOT}/packs/${pack_name}" ]]; then
                warn "Pack 未找到...功能将不可用"   ← plugin 场景必触发
              fi
```

```
check-bundle-sync.mjs
  ├─ Layer 1: hooks.json 引用的 scripts 是否在 bundle   ✅
  ├─ Layer 2: dist-plugin build presence               ✅
  └─ packs/ 完整性                                       ❌ 不校验
```

### 提议架构（Proposed Change）

```
build-dist.sh
  ├─ ...（skills/agents/commands/hooks/templates 不变）
  ├─ 【新增】拷贝正式 pack（allowlist）→ CC_BUNDLE/packs/
  │    └─ 排除 packs/pms-marriott-sample + **/*.test.ts
  ├─ 【新增】生成 CC_BUNDLE/packs/manifest.json（pack 元数据清单）
  ├─ 【新增】生成 CC_BUNDLE/packs/README.md（pack 清单说明）
  └─ ...（scripts/dist/mcp 不变）

init.sh:1254  pack 定位逻辑不变（FORGE_ROOT 解析已正确）
  ├─ 【新增】pack 命中后读 manifest.json 校验 pack 在清单中
  └─ 【新增】--pack 成功时追加埋点到 .forge/knowledge/tool-health.md

check-bundle-sync.mjs
  └─ 【新增】Layer 3: packs 完整性（期望清单 vs bundle/packs 实际）
```

## 2. 核心设计决策

### 2.1 为什么用显式 allowlist 而非 `cp -r packs`

Critic 裁决：`pms-marriott-sample` 是教学素材（含具体公司名 marriott），不该进通用 bundle。用 denylist（拷全部再排除 sample）有未来新 sample 漏配风险；**显式 allowlist**（只拷声明的正式 pack）更安全。

allowlist 实现形式：在 build-dist.sh 硬编码 `PACK_ALLOWLIST=("pms")` 数组，循环拷贝。未来新增正式 pack 时显式加数组——这是有意的摩擦点，防止 sample/实验 pack 误入 bundle。

### 2.2 packs/manifest.json schema（开放问题 1 解决）

**修正决策文档的理解错误**：pack.yaml **没有 pack 自身 version 字段**，只有 `forge_min_version`（pack 要求的最低 Forge 版本）。所以 manifest 不能用"pack version"，而用以下 schema：

```json
{
  "generated_at": "2026-06-27T12:00:00.000Z",
  "forge_version": "3.9.0",
  "packs": [
    {
      "name": "pms",
      "forge_min_version": "2.4.0",
      "path": "packs/pms"
    }
  ]
}
```

- `forge_version`：读自 package.json（bundle 发版时的 Forge 版本）
- `forge_min_version`：读自各 pack.yaml（pack 声明的最低 Forge 版本要求）
- 不引入 pack 自身 version——避免给 pack.yaml 加字段（最小侵入），forge_version + forge_min_version 已够做漂移围栏

**漂移围栏语义**：init.sh 校验 pack 在清单中（防止 bundle 缺包却配置启用），不强制 version 匹配（保持 graceful）。

### 2.3 check-bundle-sync packs 断言形式（开放问题 2 解决）

check-bundle-sync 现有模式是从 hooks.json 提取期望清单。packs 没有等价引用源，因此用 **build-dist 生成的 manifest.json 作为期望清单**：

- Layer 3 逻辑：读 `${CC_BUNDLE}/packs/manifest.json` 的 packs[].path，验证每个 path 在 bundle 中存在且非空（至少含 pack.yaml）。
- 若 manifest.json 不存在 → warn（不阻断，兼容未重建 bundle 的开发态）。
- 这与 Layer 1（hooks scripts）的"期望清单 vs 实际"模式一致，只是期望源从 hooks.json 换成 manifest.json。

### 2.4 埋点日志格式（开放问题 3 解决）

复用 `.forge/knowledge/tool-health.md` 现有条目格式。现有格式（实测）：
```
2026-06-26T23:00:54.529Z · dispatch · max-depth-exceeded · agent=deep-child ...
```
新增 pack 启用记录格式：
```
2026-06-27T12:00:00.000Z · pack-enabled · name=pms · source=plugin
```
`source` 取值：`plugin`（FORGE_ROOT=CLAUDE_PLUGIN_ROOT）/ `clone`（其他）。写入逻辑：init.sh 在 pack 成功定位 + manifest 校验通过后，`echo` 追加到 `${PROJECT_ROOT}/.forge/knowledge/tool-health.md`（若 .forge/ 不存在或不可写则跳过）。

## 3. 数据流

```
开发态                         CI/Release                    用户态
─────                         ─────────                    ─────
packs/pms/  ──build-dist.sh──> CC_BUNDLE/packs/pms/  ──plugin install──> ~/.claude/plugins/.../packs/pms/
                              CC_BUNDLE/packs/manifest.json              + manifest.json
                              CC_BUNDLE/packs/README.md                  + README.md
                                                                        │
                                                          /forge init --pack pms
                                                                        │
                                              init.sh: FORGE_ROOT/packs/pms 命中 ✅
                                              init.sh: 读 manifest.json 校验 ✅
                                              init.sh: 埋点 → .forge/knowledge/tool-health.md
```

## 4. 错误处理

| 场景 | 处理 |
|------|------|
| bundle 内 pack 缺失（manifest 有但目录空） | init.sh warn"pack 未随此 Forge 版本分发"，照常写 config（graceful，不阻断）|
| manifest.json 缺失（旧 bundle / clone 仓库） | init.sh 跳过 version 校验，warn"pack manifest 不可用，跳过版本校验" |
| check-bundle-sync 发现 pack 缺失 | exit 1（阻断 CI，强制重建 bundle）|
| 埋点写入失败（.forge/ 不可写） | 静默跳过，不阻断 init |
| pack.yaml 无 forge_min_version | manifest 该字段为 null，init.sh 跳过该校验项 |

## 5. 回滚清单（Reversibility）

- REQ-01/02/03 的 build-dist.sh 改动：删除 packs 拷贝段 + manifest/README 生成段，回滚到当前 5 连拷
- REQ-04 的 check-bundle-sync 改动：删除 Layer 3 packs 校验函数
- REQ-05 的 init.sh 改动：删除 manifest 校验 + 埋点段，保留原 pack 定位逻辑
- 挂载点：build-dist.sh（packs 拷贝点）、check-bundle-sync.mjs（Layer 3）、init.sh（pack 校验段）

## 6. 非目标重申（防 scope creep）

- 不做按需下载（security P0）
- 不做 lint glob 白名单（P1，单开 ticket）
- 不做示例领域代码（切片 A）
- 不做 pack 独立发版（推迟）
- 不改 plugin.json（packs 由 init.sh 消费，非 CC runtime 概念）

## 7. 与现有机制的一致性

- **allowlist 拷贝** vs 现有 `cp -r skills`：skills 是全量拷（无 sample 概念），packs 因含 sample 需 allowlist。这是有意差异，非不一致。
- **manifest.json** vs dist-manifest.json：dist-manifest.json 管 build-dist.sh 的文件清单（scripts）；packs/manifest.json 管 bundle 内 pack 清单。两者关注点不同，不合并。
- **埋点** vs tool-health.md：复用现有运行时日志，不引入新文件/新机制。
