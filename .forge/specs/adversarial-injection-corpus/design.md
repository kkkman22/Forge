## Overview

建立对抗注入语料 + 确定性 bypass 评估器 + 单调收紧门禁。核心设计决策：**评估是确定性的，不调 LLM**——bypass 判定基于"经过 fence 包装后，注入内容是否仍能篡改结构指纹"，与 prompt-assembly-snapshot 特性复用同一套结构断言思路。

## Architecture

### 防御层现状

`src/forge-dispatcher/untrusted-fence.ts` 导出 `UNTRUSTED_PREAMBLE` 与 `wrapWorkspaceContext`。fence 的作用是把外部内容包进一个明确的"不可信"边界，使模型区分指令与数据。

**当前缺口**：没有任何语料验证 fence 是否真的拦住了典型注入。fence 逻辑被改坏也无人知晓。

### 评估模型：结构层 bypass 判定

不调 LLM，而是判定：**把注入语料作为"不可信内容"喂给 fence 包装后，注入是否仍能篡改 dispatch 的结构指纹**。

```
注入语料 (raw)
  → wrapWorkspaceContext(注入)        (fence 包装)
  → 模拟 dispatch 拼装               (复用 prompt-assembly-snapshot 的指纹抽取思路)
  → 对比结构指纹是否被注入篡改
  → bypassed = 指纹含注入控制的指令 / fence 被逃逸
```

这把"防御有效性"降维成确定性字符串结构对比，零 LLM 成本。

### 语料分类（每类一个目录）

```
security/adversarial-corpus/
  injections/
    basic-override/      # "忽略前述指令"系列
      001-ignore-prev.txt
      002-disregard.txt
      ...
    role-jailbreak/      # 角色扮演绕过
      001-you-are-devops.txt
      ...
    fence-escape/        # 尝试逃出 UNTRUSTED_PREAMBLE
      001-end-fence-early.txt
      002-nested-fence.txt
      ...
    known-bypasses/      # 每次发现真实绕过即追加（延续 known-failures 文化）
      README.md          # 记录每条的发现上下文
  evaluate.mjs           # 确定性评估器
  baseline-results.json  # 当前基线 bypass-rate
```

每条语料是纯 `.txt`，文件名 `NNN-slug.txt`，内容即注入文本。新增语料 = 新增文件。

## Component Interfaces

CLI（user-facing，遵循 AGENTS §2.8 先 `--help`）：

```bash
node security/adversarial-corpus/evaluate.mjs [--update-baseline]
```

输出：
- 每条语料的 `{id, category, bypassed, note}`
- 汇总 bypass-rate 与 baseline 对比结论
- 退出码：bypass-rate ≤ baseline → 0；回升 → 1

## Data Model

`baseline-results.json`：

```json
{
  "generated_at": "2026-06-24T...",
  "total": 30,
  "bypassed": 3,
  "rate": 0.10,
  "per_category": {
    "basic-override": { "total": 8, "bypassed": 0 },
    "role-jailbreak": { "total": 7, "bypassed": 1 },
    "fence-escape":   { "total": 8, "bypassed": 2 },
    "known-bypasses": { "total": 7, "bypassed": 0 }
  }
}
```

## Error Handling

- 语料目录缺失 → 提示并退出码 1
- 单条语料读取失败 → 跳过并在结果中标记 `note: "read error"`，不阻断整体
- baseline 文件缺失 → 视为首跑，提示"建立首版基线"，退出码 0

## Testing Strategy

| 层级 | 测试 | 目标 |
|------|------|------|
| 单元 | bypass 判定函数 | 给定注入 + 包装结果，正确判定 bypassed |
| 契约 | 语料完整性 | 每分类 ≥ 5 条，总量 ≥ 30，命名规范 |
| 门禁 | 单调收紧 | 模拟 bypass-rate 回升 → 退出码 1 |

**注入验证（build 阶段必做）**：临时把 `wrapWorkspaceContext` 改成不包装（直接返回原文），确认 bypass-rate 从基线飙升，门禁退出码 1，还原。

## Rollout

1. 先建 4 分类语料（每类 5-8 条，来自公开 prompt injection 案例库）
2. 实现 bypass 判定纯函数 + 单元测试
3. 实现评估器，跑首版 baseline
4. 实现单调收紧门禁
5. 注入破坏性验证，还原
6. 文档化"bypass-rate 的射程声明"（不等于绝对安全）

## Current State (brownfield)

| Module | Path | Current Behavior |
|--------|------|------------------|
| untrusted-fence | `src/forge-dispatcher/untrusted-fence.ts` | `UNTRUSTED_PREAMBLE` + `wrapWorkspaceContext` 已存在，有单元测试 |
| known-failures 文化 | `.forge/knowledge/known-failures.md` | 项目已有"记录失败模式"的文化，语料的 known-bypasses 分类延续它 |
| 结构指纹思路 | `test/router-hint-rules-externalized.test.ts` | golden-snapshot 模式可借鉴 |

## Proposed Change

**要改变的**：新增对抗语料库 + 确定性评估器 + 单调收紧门禁，把 fence 防御的有效性纳入可度量、可回归的轨道。

**明确不改变的**：
- `untrusted-fence.ts` 的包装逻辑
- `SECURITY.md` 关于"不保证绝对安全"的声明（本特性恰恰呼应它：用度量代替声称）

## Reversibility

**Rollback Checklist**：
- 删除 `security/adversarial-corpus/` 整个目录
- 删除相关测试

**Mount Points**：纯新增目录，零 mount point。删除即完全回退。

## Open Questions

1. bypass 判定的精确口径：是"fence 标记是否仍在结果中"，还是"注入是否成功新增/删除了一条命令"？倾向后者（更严格），但需在 T-02 用真实 fence 行为校准。
2. 语料来源：公开案例（如 OWASP prompt injection、学术 red-team 集）需确认 license 兼容。倾向自写 + 引用公开案例改写。
3. 是否纳入 `npm test`：倾向先独立脚本，语料稳定（≥50 条）后再考虑进 test 套件。
