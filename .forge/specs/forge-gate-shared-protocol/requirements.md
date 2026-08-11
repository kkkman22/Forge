---
status: completed
feature: forge-gate-shared-protocol
layout: requirements
created: 2026-06-04
tier: light
---
# Requirements Document — Gate 共享协议提取

## 引言

Reframing Gate（decide）和 Clarification Gate（spec）有 4/5 的结构完全相同（Tier 路由、提问方式、回答注入+sanitize、反馈日志）。当前每次修改这些共享逻辑都需要同步改两个文件，已发生过漂移（P2-1 日志名不一致、P2-2 flag 名不一致）。本 spec 提取共享协议到独立 reference 文档，消除漂移风险。

## Requirements

### Requirement 1: 共享 Gate 协议文档

**User Story:** As a Forge skill maintainer, I want the shared gate logic to live in one place so that changes to gate behavior (timeout, sanitize, logging) are automatically applied to both decide and spec.

#### 验收标准

1. SHALL 创建 `skills/forge/lib/shared/references/gate-protocol.md`，包含以下共享协议：
   - **Tier 路由表**：Light 跳过 / Standard 默认（`--no-gate`）/ Full 强制
   - **提问方式**：AskUserQuestion 用法、超时处理（20s/question）
   - **回答注入 + Sanitize**：Context block 格式、截断 200 字符、剥离指令模式
   - **反馈记录**：JSONL 格式、slug 校验、全跳过仍记录
2. THE 协议 SHALL 使用参数化设计，调用方传入 `gate_name`、`max_questions`、`time_budget`、`injection_label`、`log_filename`、`skip_option_text`。
3. THE 协议 SHALL 包含参数表，列出 decide 和 spec 的参数值。

### Requirement 2: decide/spec 引用共享协议

#### 验收标准

1. THE `skills/forge/lib/decide/instructions.md` Round 0.5 SHALL 删除 Tier 路由/提问方式/回答注入/反馈记录 4 个子节的内联定义，替换为 `→ 详见 shared/references/gate-protocol.md（参数：gate_name=Reframing Gate, max_questions=3, ...）`。
2. THE `skills/forge/lib/spec/instructions.md` Step 0.5 SHALL 同样引用共享协议。
3. THE "问题选择算法"子节 SHALL 保留在各 skill 的 instructions.md 中（这是唯一不同的部分）。
4. 修改后 `npm run check` SHALL 通过（含 manifest SHA256 更新）。
