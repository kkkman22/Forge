---
topic: planning-with-files-borrow-impl-review
date: 2026-06-23
result: blocked
reviewed_at_branch: forge/planning-with-files-borrow
reviewed_at_commit: 671cf2ea
methodology: subagent-parallel
layers: [spec-check, quality-check, security-check]
severity_counts:
  p0: 1
  p1: 4
  p2: 8
  p3: 7
artifact_kind: code-implementation
---

# Review: planning-with-files-borrow 实现 (forge/planning-with-files-borrow)

> 三层 subagent 并行评审,对象是 8 个 commit(R1-R6 + Task7)的代码实现。按 §3.1 评审者独立于实现者。

## 结论

**🚫 BLOCKED — 1 P0 + 4 P1,ship 阻断。**

三层高度一致(多个 finding 交叉确认)。核心问题集中在两点:**R3 指针机制只读不写(死代码)** 和 **多处 spec AC 字面要求与代码不符**。安全防护本身(R1/R5 转义、R3 realpath)**验证真正生效**,非纸面。

## Severity 总览

| Layer | P0 | P1 | P2 | P3 |
|-------|----|----|----|----|
| spec-check | 1 | 3 | 4 | 2 |
| quality-check | 0 | 3 | 3 | 4 |
| security-check | 0 | 0 | 2 | 3 |
| **去重合计** | **1** | **4** | **8** | **7** |

> 注:多份报告的同一问题已合并(SC-2=Q1、SC-4=Q3=S-1、SC-3=Q8=S-4、Q2=S-2)。

## P0 Findings(必须修复,阻断 ship)

### SC-1 (P0) | R3 active-plan 指针只读不写——生产环境死代码

**根因**:R3.AC2 要求"指针由 plan approve 或 build 启动时设置,阶段切换时更新 phase"。`tryReadActivePlanPointer` 读取器实现了且实质有效,但**整个仓库没有任何写入者**。`.forge/state/` 在生产 worktree 为空。生产中每次运行都走 legacy mtime 回退,指针机制永不触发。validation.md 和 VAL-R3-002 却标记 PASS。

**为何 P0**:这是"声称已实现但实际未接线"(L3 Wired 失败)。测试用 `writeActivePlan()` stub 合成指针通过测试,但测试通过 ≠ 生产接线。R3 的核心价值(单一权威计划、消除三源漂移)在生产中完全不生效。

**修复方向**:在 plan approve 路径(`forge approve`/plan SKILL)或 build 启动路径写入 active-plan.json;或在 spec 显式降级 R3.AC2 为"读取器就绪,写入者 deferred",修正 VAL-R3-002 描述。

## P1 Findings(发布前修复,阻断 ship)

| ID(合并) | 问题 | 三份确认 |
|-----------|------|----------|
| **R1-阶段过滤** | R1.AC1 要求"识别属于当前阶段的任务",但 phase 只用于计算 `phaseKnown` 布尔(标注用),收集循环对所有 progress 文件所有 `- [ ]` 行无差别收集,无阶段归属过滤 | SC-2 + Q1 |
| **R5-整段灌入** | R5.AC3 要求"只提取 frontmatter 结构化字段(title/severity),非自由文本",实现却整个 findings 文件转义后灌入边界,无 frontmatter 解析、无标题/首段提取。削弱间接 prompt-injection 防御纵深 | SC-4 + Q3 + S-1 |
| **64KB 名实不符** | `Buffer.byteLength` 按字节计,但 `content.slice(0, CAP)` 按 UTF-16 字符截断。中文(3字节/字符)实际可放行 ~192KB,64KB 防线对 CJK 失效。且 readFileSync 先全量读入再截断(非 bounded read) | Q2 + S-2 |
| **R3-spec_ref 未校验** | R3.AC3 要求 plan_path 和 spec_ref 都 realpath 校验。代码只校验 plan_path,`SPECS_DIR` 定义后从未使用(死常量),spec_ref 字段全程未读 | SC-3 + Q8 + S-4 |

## P2 Findings(应修复,可协商)

- **SC-5**:R5.AC1 要求"PreToolUse(Write|Edit) 注入 findings",但 `hooks/hooks.json`(插件分发)只在 UserPromptSubmit 注册 inject,PreToolUse 未挂载。插件用户路径下 findings 不在编辑时注入。
- **SC-6/Q-契约**:R2 hooks-inventory 声明 Hint-Type 契约为 `exit 0 + {"hookSpecificOutput":{...}}` JSON,但 stop/inject 实际输出纯文本(console.log),未发 JSON 结构。文档契约与代码不符。
- **SC-7**:VAL-R6-002 要求 `! grep "三级路由|subagent" quick-start.md`,但 quick-start:43 引用句含这些词,字面契约失败。validation.md 未跑此项却标 PASS。
- **Q4**:stop 与 inject 解析 phase 的正则不一致(`[^\s"']+` vs `[^"\n]*`),同一 status.md 两脚本读出不同 phase。
- **Q5**:`escapeAngleBrackets` 在两脚本重复定义,易漂移。
- **Q6**:inject 主 try 块指针分支 ~28 行 4 层嵌套,可抽函数。
- **S-3**:R3 realpath 边界在 Windows 跨盘符下可绕过(`relative` 返回绝对路径,双重校验都通过)。Forge 运行在 darwin/Linux,实际不可达,仅完整性记录。
- **S-5**:转义防御依赖 LLM 不还原 HTML 实体(`&lt;`→`<`),假设合理但不可证明,建议文档显式声明此假设。

## P3 Findings(建议改进)

SC-8(R1 失败模式未在 hooks-inventory 复述)、SC-9(64KB 截断无标注)、SC-10(README 测试计数 8523 vs 8505+17 不一致)、Q7(SPECS_DIR 死代码)、Q9(测试用 require + relativePath 反直觉)、Q10(测试覆盖缺口:无中文截断/无 phase 过滤/symlink 测试静默 skip)、S-4(=R3-spec_ref,dead field)

## 通过项(防护真正生效)

三层一致确认以下防护**非纸面,真实有效**:
- ✅ **R1 注入边界**:先提取 `^- \[ \]` 行再转义(顺序正确),硬编码模板,数据/指令分离
- ✅ **R5 转义完整**:`escapeAngleBrackets` 同时转义 `<` 和 `>`,无二次编码
- ✅ **R3 Unix realpath**:物理路径校验 + relative 双重判定,Unix 下完备,symlink/.. 穿越被拒(测试双向量覆盖)
- ✅ **R1 prompt-only 诚实**:0 处 exit(2),无"强制/硬门禁"误导措辞,docs 如实披露
- ✅ **冻结区合规**:config.md 仅 +1 行 additive
- ✅ **fail-open 正确**:两脚本 try/catch + exit 0
- ✅ **无 ReDoS**:所有正则行首锚点、无回溯贪婪组
- ✅ **反漂移**:三级路由/review 三层/stop-phase-verify 未动,无 exit(2)/unlink/attestation,IRON-LAW 全保留

## 修复优先级建议

**一个 P0(SC-1 R3 写入者)** 决定了 R3 在生产中是否生效,是首要决策点:
- **选项 A**(补写入者):在 plan approve/build 启动写 active-plan.json。工作量大但 R3 真正落地。
- **选项 B**(降级 spec):承认 R3 当前是"读取器就绪,写入者 deferred",修正 VAL + AC 描述。R4/R5 仍可基于 slug 定位(不依赖指针写入)。

**P1 四项** 中:
- R1 阶段过滤 + R5 结构化提取:需补实现(或在 spec 降级 AC)
- 64KB 字节截断:改用 `Buffer.subarray`(技术修复,低工作量)
- spec_ref 校验:补全或删 SPECS_DIR 死常量

修复后须重新 review(§3.3)。
