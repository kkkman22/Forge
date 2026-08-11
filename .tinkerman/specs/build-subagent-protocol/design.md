---
feature: build-subagent-protocol
layout: design
created: 2026-06-04
---

# Design Document: Build Subagent Protocol

## Overview

在 forge-build agent 和 build/review instructions 中增加三项来自 superpowers 的执行纪律增强：合理化预防表（Rationalization Prevention）、四状态码（Status Protocol）、反讨好回应（Anti-Performative Agreement）。纯 Markdown 内容改动。

## Architecture

无架构变更。修改 `.claude/agents/forge-build.md`、`skills/forge/lib/build/instructions.md`、`skills/forge/lib/review/instructions.md`、`CLAUDE.md`。

## Components and Interfaces

### 1. CLAUDE.md §2.1.2 TDD 合理化预防表

在现有 `tdd-delete-and-restart` 铁律声明之后追加：

```markdown
### 2.1.2 TDD 合理化预防表

以下想法出现时 = 你正在逃避铁律，STOP：

| 想法 | 事实 |
|------|------|
| "太简单了不用测" | 简单代码也会坏。测试只需 30 秒。 |
| "我先写实现再补测试" | 后补的测试立刻通过，证明不了什么。 |
| "我已经手动验证了" | 手动验证不可复现、不覆盖边界、不能回归。 |
| "删掉 X 小时的工作太浪费" | 沉没成本谬误。保留未验证的代码才是技术债。 |
| "这次例外" | "这次例外"是所有技术债的起点。 |
| "先探索一下再写测试" | 探索可以，但探索完必须删除，从测试开始。 |
| "测试太难写 = 设计有问题" | 这是好信号，不是跳过测试的理由。 |
| "我保留代码当参考" | "保留当参考" = 看着参考写测试 = 不是 TDD。删除。 |
| "我记住 skill 内容了" | Skill 会迭代。每次重新加载当前版本。 |
| "TDD 太教条了，要务实" | TDD 才是务实：先测后写比先写后测更快找到 bug。 |
| "我看代码逻辑是对的" | 你看的不是测试覆盖，是自我说服。 |
| "这个任务不需要走 TDD" | 除 CLAUDE.md §2.1 明确列出的例外，所有任务都需要。 |
```

### 2. CLAUDE.md §2.3.1 验证合理化预防表

在现有 `verification-run-command` 铁律之后追加：

```markdown
### 2.3.1 验证合理化预防表

| 想法 | 事实 |
|------|------|
| "应该可以了" | "应该"不是证据。运行验证命令。 |
| "我很确定" | 确定度 ≠ 证据。运行验证命令。 |
| "就这一次跳过" | 没有例外。 |
| "lint 通过了" | lint ≠ typecheck ≠ 测试。 |
| "subagent 报告成功" | 独立验证 subagent 报告。看 diff，看测试输出。 |
| "我累了" | 疲劳不是跳过验证的理由。 |
| "部分验证够了" | 部分验证证明不了什么。 |
| "输出看起来干净" | 看起来干净 ≠ exit code 0 + 0 failures。运行它。 |
```

### 3. forge-build.md Report Format

新增章节：

```markdown
## Report Format（铁律）

每个 task 完成后，最终输出必须以以下格式开头：

STATUS: <DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT>

### DONE
任务按 spec 完成，所有验证通过。后续：controller 进入 review 流程。

### DONE_WITH_CONCERNS
任务完成但有疑虑（功能正确性存疑、文件过大、性能隐患）。
后续：controller 先读 concerns 再决定是否进入 review。
禁止：把 DONE_WITH_CONCERNS 当 DONE 使用（concerns 必须明确列出）。

### BLOCKED
无法完成任务。必须附上：被什么阻断、已尝试什么、需要什么帮助。
后续：controller 评估（提供更多上下文 / 升级模型 / 拆分任务 / 升级用户）。
禁止：忽略 BLOCKED 直接重试同模型同指令。

### NEEDS_CONTEXT
缺少完成任务所需的信息。必须附上：缺什么信息、为什么需要。
后续：controller 提供信息后重新派发。
禁止：猜测或假设缺失信息。
```

### 4. forge-build.md 升级安全阀

```markdown
## 升级安全阀

随时可以停下来报告"这个任务对我太难了"。糟糕的工作比没有工作更差。你不会因为升级而受罚。

**STOP 并升级当：**
- 任务需要多种可行方案之间的架构决策
- 需要理解超出所提供范围的代码，且无法理清
- 不确定当前方法是否正确
- 任务涉及计划未预见到的现有代码重构

**升级方式：** 报告 `STATUS: BLOCKED` 或 `STATUS: NEEDS_CONTEXT`。
```

### 5. forge-build.md Self-Review

```markdown
## Self-Review（报告前必做）

**完整性：** 我是否完整实现了所有要求？是否有遗漏的需求？是否有未处理的边界？
**质量：** 这是我最好的工作吗？命名是否清晰？代码是否干净可维护？
**纪律：** 是否避免了过度构建（YAGNI）？是否只做了被要求的事？是否遵循了既有模式？
**测试：** 测试是否验证真实行为？是否遵循了 TDD？测试是否全面？

自审发现问题 → 先修复再报告。
```

### 6. build/instructions.md Subagent Status Handling

```markdown
## Subagent Status Handling

### STATUS: DONE → 正常进入下一 task 或触发 review

### STATUS: DONE_WITH_CONCERNS
1. 读取 concerns 列表
2. 正确性/范围疑虑 → 先修复再 review；观察性疑虑 → 记录，继续 review
3. 判断结果写入 `.tinkerman/status.md`

### STATUS: BLOCKED
1. 评估：上下文不足 → 补充重派 / 需更强推理 → 升级模型 / 任务过大 → 拆分 / 计划有问题 → 升级用户
2. 同一任务连续 BLOCKED 3 次 → 触发 Three-Strike Reroute（CLAUDE.md §2.4）

### STATUS: NEEDS_CONTEXT
1. 从 plan/spec/codebase 中获取缺失信息
2. 附加到 prompt 重新派发
3. 同一任务连续 NEEDS_CONTEXT 2 次 → 升级为 BLOCKED 处理
```

### 7. build/instructions.md TDD Red Flags

```markdown
## TDD Red Flags — 出现以下想法时 STOP

- 代码先于测试编写
- "我先探索实现，测试后面补"
- 测试立刻通过（没有先看到失败）
- 无法解释为什么测试失败
- 测试是"后来加的"
- "这次例外"
- "我已经手动测过了"
- "保留代码当参考"
- "花了好几个小时，删掉太浪费"
- "TDD 太教条了"
- "这个不一样因为..."

**以上任何一条 = 删除代码，从测试开始。**
```

### 8. forge-build.md Anti-Performative Agreement

```markdown
## Anti-Performative Agreement（铁律）

收到 review 反馈后，**禁止**纯情感表达：
- ❌ "你说得对！" / "You're absolutely right!"
- ❌ "好点子！" / "Great point!"
- ❌ "感谢指出！" / "Thanks for catching that!"

**正确格式：** `Fixed. [简要描述改了什么]`

- ❌ "你说得对！我确实漏了空值检查，现在修好了。"
- ✅ "Fixed. Added null check for `config` before accessing `config.timeout`."
- ❌ "好点子！我把魔法数字提取成了常量。"
- ✅ "Fixed. Extracted `PROGRESS_INTERVAL = 100` constant."

回应必须包含可验证的技术变更描述，不是情感表达。
```

### 9. review/instructions.md Sycophancy Detection

```markdown
## Sycophancy Detection（Re-review 检查项）

| 模式 | 判定 |
|------|------|
| 纯赞同无技术描述（"你说得对"） | P3 — 无效沟通 |
| 口头同意但修复不匹配 review 要求 | P1 — 修复偏题 |
| 口头同意但修复不完整 | P1 — 修复不完整 |
| 技术回应 + 实际修复 | ✅ 正确 |

判断方法：比较 reviewer 要求的修复点 vs implementer 实际代码 diff。忽略口头声明。
```

### 10. CLAUDE.md §2.6 反讨好条款

在 §2.6 Output Conciseness 追加：

```markdown
### 反讨好纪律

所有对 review/feedback 的回应禁止纯情感表达（"你说得对"、"好建议"）。回应格式：`Fixed. [技术描述]`。违反此条等同违反 Output Conciseness。
```

## Testing Strategy

- 人工审查：确认 3 个新增表格 + 3 个新增章节内容正确且无重复
- `npm run check`：全量测试通过（本 spec 无代码变更）
