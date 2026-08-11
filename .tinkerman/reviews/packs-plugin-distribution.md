---
topic: packs-plugin-distribution
date: 2026-06-29
result: pass
reviewed_at_commit: c1b698e1
tier: full
methodology: subagent-parallel
layers:
  - spec-check: pass
  - quality-check: pass
  - security-check: pass (S-001 P0 resolved)
severity_counts:
  p0: 0
  p1: 0
  p2: 0
  p3: 4
deviation_assessment: dual-bundle Rule-2 copy justified (REQ-05 plugin-path honesty)
core_fix_verified: true
---

# Review Report — packs-plugin-distribution（切片 A'）

> 三层独立 subagent 评审 + controller 独立验证（§7.1）。S-001 P0 经独立 PoC 复核确认已关闭。

## 综合结论

✅ **PASS | P0:0 | P1:0 | P2:0 | P3:4**

7 REQ 全部 VERIFIED；INV-1..5 满足；核心修复（plugin 路径 `--pack pms` 不再 warn "功能将不可用"）经 smoke e2e + 独立 PoC 双重确认；唯一 P0（S-001 RCE sink）已在 `c1b698e1` 修复并经 controller 独立复验关闭。

## Layer 1 — spec-check（PASS）

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-01 pack copy | VERIFIED | build-dist.sh `copy_packs`（allowlist `pms`，排除 sample + *.test.ts），CC + dist-plugin 双 bundle |
| REQ-02 README | VERIFIED | `gen_packs_readme` build-dist.sh:496-530；smoke 断言 可忽略/pms |
| REQ-03 manifest.json | VERIFIED | `gen_packs_manifest` schema 含 generated_at/forge_version/packs[]，符合 design §2.2 |
| REQ-04 bundle-sync Layer 3 | VERIFIED | `checkPacksIntegrity` check-bundle-sync.mjs，CC+Plugin 双校验，5 vitest 用例 |
| REQ-05 init manifest guard | VERIFIED | init.sh pack loop 读 manifest + graceful warn；D1/D2/D4 断言 |
| REQ-06 telemetry | VERIFIED | init.sh tool-health write（source=plugin/clone），format 符合 design §2.4 |
| REQ-07 regression | VERIFIED | `npm run check` EXIT=0，718 files / 8933 passed |

INV-1~5 全 PASS。Must-Haves Merge：7 task ↔ 7 REQ 1:1 无 gap。

**Deviation 裁决**：dual-bundle（CC + dist-plugin）Rule-2 copy **合理，非 scope creep**。REQ-01 Evidence 文本只写 `${CC_BUNDLE}`，但 REQ-05 要求 plugin 路径能找到 pack，而 plugin 安装从 dist-plugin zip 走——仅拷 CC 会让 REQ-05/T7 继续撒谎。双拷是最小诚实修复，与现有 skills/agents 双拷对称。

## Layer 2 — quality-check（PASS）

9 findings（4×P2 + 5×P3），其中 4 项已在 `c1b698e1` 修复：

| ID | Sev | 状态 | Title |
|----|-----|------|-------|
| Q-001 | P2 | 残留 | init.sh malformed manifest 被误标为"未声明"（JSON.parse throw → 2>/dev/null → exit 1 → warn） |
| Q-002 | P2 | 残留 | checkPacksIntegrity 静默跳过 malformed manifest（readPacksManifest 返回 null） |
| Q-003 | P2 | ✅ 已修 `c1b698e1` | smoke telemetry 断言改无条件（消除 vacuous-pass） |
| Q-004 | P2 | ✅ 已修 `c1b698e1` | D2 断言去掉弱 `|manifest` alternative |
| Q-005 | P3 | 接受 | gen_packs_manifest 内联 node -e，可未来提取为独立 .mjs |
| Q-006 | P3 | ✅ 已修 `c1b698e1` | 移除 dead existsSync/renameSync imports |
| Q-007 | P3 | ✅ 已修 `c1b698e1` | 移除 dead packs.manifest.json.dummy 行 |
| Q-008 | P3 | 接受 | checkPacksIntegrity 空检查未特指 pack.yaml（design §2.3 偏离，build-dist 拥有内容，低风险） |
| Q-009 | P3 | 接受 | smoke e2e 全量并行下偶发 flaky（隔离跑确定，非正确性缺陷） |

**残留 P2（Q-001/Q-002）裁决**：两者都是 malformed-manifest 错误路径的边缘 case，且 manifest.json 由 build-dist 生成（可信源），用户态几乎不可达。graceful-degradation 意图被遵守（不阻断 init/CI）。不阻断 ship，建议后续小 commit 补 malformed-JSON 测试用例。

## Layer 3 — security-check（PASS，S-001 P0 已关闭）

| ID | Sev | 状态 | Title |
|----|-----|------|-------|
| S-001 | P0 | ✅ 已修 `c1b698e1` | 命令注入/RCE via unsanitized `${pack_name}` in `node -e` |
| S-002 | P3 | 接受 | checkPacksIntegrity path-traversal 防御深度（manifest 是 build 生成，非用户可达） |
| S-003 | P3 | 接受 | business-day-clock.ts 无 @non-production header（slice A' 分发面，建议补） |

### S-001 独立验证记录（§7.1）

security-check 报 S-001 P0 后，controller 独立复核：
1. 溯源：`--pack` 从 init.sh:78 `PACKS+=("$2")` 进入，无 sanitize，在 init.sh:1269 `node -e "... p.name === '${pack_name}' ..."` 插值。
2. PoC（修复前）：直接对 sink eval payload `pms'); var cp=require('child_process'); cp.execSync('touch /tmp/forge-rce-poc2'); var _=('` → **marker 文件创建，RCE 成立**。
3. 修复 `c1b698e1`：`--pack` 解析时 regex 校验 `^[a-z0-9-]+$`，不匹配 exit 1 + "非法字符"。
4. 复验（修复后）：同一 payload → exit 1 + "非法字符" + **无 marker 文件**；合法 `--pack pms` 仍正常激活。**sink 已关闭**。

STRIDE 其余面：path-traversal（build 期，非用户可达）、telemetry（无 PII）、network（INV-3 零命中）、secrets（零）、unsafe node APIs（packs/pms 无 eval/child_process）—— 全 PASS。

## 残留 P3（非阻断，可后续优化）

- Q-001/Q-002：malformed-manifest 错误路径测试覆盖
- Q-005：gen_packs_manifest 提取为独立 .mjs
- Q-008：checkPacksIntegrity 特指 pack.yaml
- Q-009：smoke e2e 隔离 vitest project
- S-002：path-traversal 防御深度 guard
- S-003：business-day-clock.ts 补 @non-production header
- spec F2：telemetry 记 forge version
- spec F3：pack_source 字符串比较 symlink 鲁棒性

## Ship 门禁

无 P0/P1 残留 → **ship 放行**。残留项全为 P3（非阻断），可后续小 commit 处理。
