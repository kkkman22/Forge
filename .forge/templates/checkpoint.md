# Session Checkpoint

> 由 checkpoint-writer subagent 自动维护的结构化会话状态快照。
> compact 发生时由 PostCompact hook 读取并预算化注入，实现"再生式"上下文重建。
> **只编辑 italic 指令行下方的正文，不要改 `##` 标题和 italic 指令行。**

---

## §1 当前阶段与意图
_当前 Forge 阶段（plan/build/review/test/ship）+ 用户最近的显式请求。用户原话必须用 block-quote 逐字引用，不要 paraphrase。_
_预算：~500 tokens_

阶段：(none)

> (用户原话待填)

## §2 下一步具体动作
_单一下一步具体步骤，从 §1 和当前状态推导。用户给过明确指令时带上 verbatim 引用。_
_预算：~1000 tokens_

(none yet)

## §3 本会话指令
_本会话特定的工作风格偏好（非项目级规则，项目级规则在 CLAUDE.md / evolved-rules.md）。例："字段用 snake_case"、"避免 try/catch 用 early-return"。_
_预算：~800 tokens_

(none)

## §4 当前工作
_compact 前一刻正在做什么。提及具体文件路径和代码位置（file:line）。_
_预算：~2000 tokens_

(none yet)

## §5 文件与代码区段
_本会话活跃读写的文件，每个一行用途说明。例："src/lexer.ts — token kinds 定义，source of truth"。_
_预算：~1500 tokens_

(none yet)

## §6 已发现问题与修复
_本会话遇到的错误及如何解决。最新在前。例："X 在第 N 行因 Y 崩溃；用 Z 修复"。_
_预算：~1500 tokens_

(none)

## §7 活跃资源
_运行时状态：branch、未提交文件、运行中的进程、temp artifacts。最易变——不要纠结每分钟都变的细节。_
_预算：~1000 tokens_

(none yet)

## §8 设计决策与讨论结果
_通过讨论达成的、未产生即时代码/文件产物的决策。捕获用户意图或权衡理由——未来 agent 需要理解"为什么这么做"。证明跨会话持久后，提升进 CLAUDE.md 或 evolved-rules.md。_
_预算：~3000 tokens_

(none yet)

## §9 待迁移知识
_本会话学到的、可能适用于未来任务的事实。证明持久后是提升进 knowledge/ 的候选。_
_预算：~1500 tokens_

(none yet)

## §10 开放笔记
_writer 整理的兜底区：不适合 §1-§9 的内容放这里。对话引用、未决问题、微观察。拿不准时宁可留空——多数 checkpoint 这里没东西。_
_预算：~800 tokens_

(none yet)

## §11 EXACT-FORM 值（逐字节保留）
_用户在本会话中给出的所有精确值，必须逐字节复制，禁止 paraphrase。覆盖：连接串/DSN、host:port、env var 值、API token、文件路径、完整命令行+flags、版本号 pin、ID、seed。_
_规则：保留字面量原样（反引号、标点、两个端口不同时都保留）。"总结成'用户给了一个 DB 配置'会丢失值——重点就是事后逐字复现。拿不准是否 exact-form 时，当 exact-form 处理并复制。_
_预算：~800 tokens_

(none yet)
