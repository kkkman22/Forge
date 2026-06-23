---
topic: planning-with-files-borrow-impl-rereview
date: 2026-06-23
result: pass-after-rereview
reviewed_at_branch: forge/planning-with-files-borrow
reviewed_at_commit: b944be85
re_review_of: e9928c07 (BLOCKED 1P0+4P1)
methodology: subagent-parallel
layers: [spec-check, security-check]
severity_counts:
  new_p0: 0
  new_p1: 0
  new_p2: 0
  new_p3: 5
---

# Re-Review: planning-with-files-borrow 修复复审

> 按 §3.3 修复后须重新评审。本轮复审验证原 P0/P1 修复 + 检测修复引入的 regression。

## 结论

**✅ PASS — 原 P0/P1 全部修复,无新 P0/P1 regression。ship-gate 放行。**

spec-check + security 双层并行复审一致确认。5 个 P3 完整性问题不阻断。

## 原 finding 修复判定(spec-check)

| ID | 原级别 | 判定 | 证据 |
|----|--------|------|------|
| **SC-1** R3 只读不写 | P0 | ✅ FIXED | `set-active-plan.mjs:172` 真写入 active-plan.json;端到端验证 writer 写指针 → inject 单一权威路径注入(实测产出 `=== Forge Context ===`);plan Step 5 + build §1.6.1 接线;manifest sha 双更新(plan/build 实算 == manifest) |
| **SC-2/Q1** R1 阶段过滤 | P1 | ✅ FIXED | stop-incomplete-tasks.mjs phase=review 时 build-phase.md 被跳过,review-phase.md + 无标记文件保留(向后兼容) |
| **SC-4/Q3** R5 结构化提取 | P1 | ✅ FIXED | extractFindingsFields 提取 frontmatter title/summary/severity + 首段(跳过纯标题段),第二段不注入,整段灌入已消除 |
| **SC-3** R3 spec_ref 校验 | P1 | ✅ FIXED | 双侧校验:writer(set-active-plan 拒 `../etc/passwd`)+ reader(inject 拒 poisoned pointer 降级);SPECS_DIR 不再死常量 |
| **SC-7** VAL-R6-002 | P2 | ✅ FIXED | quick-start:43 去掉"三级路由/subagent",grep 零命中 |

> Q2(64KB 字节截断)security 实测验证:truncateToBytes CJK cap=11→9 bytes(回退 char 边界)、cap=0→"",UTF-8 边界回退 `(buf[cut] & 0xc0) === 0x80` 逻辑完备,无越界。

## 安全复审(security)

**无新 P0/P1 regression。** 核心防护(R1/R5 转义、R3 realpath)未破坏。新增 set-active-plan.mjs 的路径校验 Unix 下完备、fail-closed on traversal、reader 侧独立复核无 TOCTOU。

关键确认:
- spec_ref 词法校验理论有 symlink 风险,但 **spec_ref 文件内容全程从不被 readFileSync 读取/注入**——指针只存路径,故无实际危害(纵深冗余,非 regression)。
- R1 阶段过滤 fail-toward-reporting(无 phase 标记的文件仍纳入,**不漏报**未完成任务),安全中性。
- 三脚本(inject/stop/set-active-plan)fail-open 一致(try/catch + exit 0),stderr 不进 LLM 上下文。

## 本轮新发现(全部 P3,不阻断)

| ID | 问题 | 影响 |
|----|------|------|
| P3-1 | set-active-plan `resolvesInside` 接受目录作为 plan_path(`rel === ""` 返回 true) | 极小:reader readFileSync 目录抛 EISDIR→降级 legacy;SKILL 传 `.md` 文件路径,非用户可达误用 |
| P3-2 | R5 extractFindingsFields 按 `\n` 锚定,CRLF 文件不解析 frontmatter | 非本次引入(全仓库 LF 锚定一致),内容仍受 boundary+escape 约束 |
| RR-1 | resolvesInside 第70行二次 resolve 比对在中间含 symlink 时可能误拒合法路径 | over-restrictive(false negative),非 under-restrictive,不构成安全 regression |
| RR-2 | spec_ref 词法校验无法防 ".forge/specs/ 内 symlink" | spec_ref 内容不读取,无实际危害 |
| RR-3 | 单段 findings(无空行)首段含自由文本 | 三重保护(边界+转义+标注),R5 目标是"缩小面"非"零注入",设计接受 |

## 测试

- R1/R3/R4/R5 + set-active-plan: **46 测试全过**(set-active-plan 8 + inject 29 + stop 9)
- 全量 npm run check: 18 失败均为 dist-plugin/mcp 构建产物环境问题(与 origin/main 基线一致,**零 regression**)
- manifest 重建:plan + build 两 sha 更新,38 subs 完整,dispatcher checkIntegrity 通过

## Sycophancy 检测(§8c)

按 §8c,复审检测 implementer 是否口头同意而实际修复不匹配。核验:每个原 P0/P1 finding 都有**对应代码 diff**(非纯口头)。SC-1 新增 set-active-plan.mjs(368 行)+ SKILL 接线;SC-2 阶段过滤代码 + 测试;SC-4 extractFindingsFields 函数 + 测试;SC-3 双侧 spec_ref 校验;SC-7 quick-start 改写。**修复与 finding 完全对应,无 sycophancy。**

## ship-gate 判定

- P0: 0 | P1: 0(原 1+4 全修)
- 无新 regression
- **ship-gate 放行**,可进入 ship 阶段。

剩余 P2(原 SC-5 PreToolUse 接线、SC-6 JSON 契约、Q4 正则不一致、Q5 重复定义、Q6 可维护性)+ P3 可在后续迭代处理,不阻断本次 ship。
