---
run_id: "632cfcb5"
branch: "forge/agency-borrow-impl"
base: "c502db03 (main)"
date: "2026-06-23"
scope: "agency-borrow spec 实现(46 文件,+2929/-1105)"
verdict: "PASS (0 P0, 0 P1)"
severity_counts:
  P0: 0
  P1: 0
  P2: 4
  P3: 4
---

# Review: agency-borrow 实现

> Dogfooding: 用(刚被改进的)review 评审"对 review 的改进"。
> 三层 review 由 Explore subagent 承载 review agent 指令逻辑执行(ZCode harness 限制:无法直接 spawn Claude Code subagent,以 Explore 读取 agent 定义后执行等效检查为近似)。

## 总判定:PASS

无 P0/P1 阻断项(§3.3)。4 P2 + 4 P3 为改进建议,不阻断 ship。

## Layer 1 — Spec Alignment (spec-check)

| # | Sev | 文件 | 问题 | 修复建议 |
|---|-----|------|------|---------|
| L1-1 | P2 | `agents/forge-review.md` | spec#3 R2.4 要求 forge-review 加 `vibe`,实际缺失(其余 3 review agent 均有) | 加 `vibe: "写代码者不评审自己,三层独立"` |
| L1-2 | P2 | `.claude/agents/` | spec#1 R1.3 要求 adversarial-check/frontend-check/validation-pass 回流 .claude/agents/;9 个 agents/ 独有 agent 无 symlink。forge-review 派发 adversarial-check/validation-pass,R6"角色未加载"风险 | **需裁决**:Claude Code 从哪加载?若 .claude/agents/ 则需补 symlink;若 agents/ 则 ADR-0010 隐含修订需显式记录 |
| L1-3 | P2 | `agents/README.md` / `.claude/agents/README.md` | spec#1 R1.2/Task0.5/D4 + ADR-0010 要求"唯一源"/"勿手编"标记,两者均缺失 | 创建两个 README |
| L1-4 | P3 | `agents/forge-review.md` | spec#3 R3.3 要求 forge-review Critical Rules 内嵌 §3.3,无此 section | 加 Critical Rules + §3.3 引用 |

**通过项**:R1 唯一源、R2 门禁接入、R4 中文 description、spec#2 查重/lint、spec#3 模板+vibe+§3.1、spec#5 ADR — 全部对齐。

## Layer 2 — Code Quality (quality-check)

| # | Sev | 文件 | 问题 | 修复建议 |
|---|-----|------|------|---------|
| L2-1 | P2 | `scripts/*.mjs` vs `src/*.ts` | src/CLI 算法双源重复,门禁(.mjs)无测试覆盖,drift 风险(已现首个分化:extractEntities 拆分 vs 合并) | 加 drift guard 冒烟测试,或统一实体提取函数 |
| L2-2 | P3 | `src/agent-links.ts:88` | `agentsDir` 死参数(biome-ignore 自承未用) | 移除或真正用于校验 |
| L2-3 | P3 | `src/agent-originality.ts` | extractToolEntities/extractNameEntities 已与 CLI 分化 | 统一为一份 |
| L2-4 | P3 | `test/agent-originality.test.ts` | 实体提取的 frontmatter 解析无测试覆盖 | 补单测 |

**通过项**:纯函数设计、错误处理、O(n²) 可接受、命名一致、Deslop clean。

## Layer 3 — Security & Risk (security-check)

**无安全问题(0 P0/P1/P2/P3)**。六维全过:
- 正则构造全部标准转义,无可信边界外输入,无 ReDoS
- `execSync` 硬编码命令,无 shell 注入
- 未引入新依赖
- check-agent-links 全程只读
- 无敏感数据泄露
- 无可执行配置文件风险变更

## 处置决策

### 立即修(P2,L1-2 需裁决后定)
- **L1-2**(9 agent 未 symlink):这是唯一需判断的项。核实 Claude Code 加载路径后决定。

### 本次可修(快速,低风险)
- L1-1:forge-review 加 vibe(1 行)
- L1-3:创建两个 README
- L1-4:forge-review 加 §3.3 引用
- L2-2:移除 agentsDir 死参数
- L2-3:统一实体提取函数

### 留后续(P3,不阻断)
- L2-1:drift guard 冒烟测试(架构性改进,单开)
- L2-4:补 frontmatter 解析测试
