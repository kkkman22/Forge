# Router Intent Dictionary

> Intent signals for `/forge <natural language>` routing.
> Each intent maps user-expressed execution preferences to RouteHint injections.
> Schema: intent_name / description / triggers[] / emit_hints[]

ultrathink:
  description: "深度推理模式 — 适合架构决策、复杂调试、跨系统集成"
  triggers:
    - 深思熟虑
    - 深度推理
    - 慎重决策
    - ultrathink
    - think hard
  emit_hints:
    - { command: decide, tag: reasoning-deep, description: "采用更长推理路径与多轮 critic" }
    - { command: plan, tag: reasoning-deep, description: "对架构选择展开备选方案对比" }
    - { command: debug, tag: reasoning-deep, description: "全面排查根因，避免补丁式修复" }

tdd-strict:
  description: "严格 TDD — 强制 RED/GREEN 分离原子提交"
  triggers:
    - 严格 tdd
    - test-first
    - 测试先行
    - tdd-strict
  emit_hints:
    - { command: build, tag: tdd-strict, description: "RED 与 GREEN 拆为两次原子提交" }
    - { command: fix, tag: tdd-strict, description: "失败用例写入回归套件" }

security-deep:
  description: "深度安全审计 — 触发威胁建模与 SAST 强校验"
  triggers:
    - 安全审计
    - 威胁建模
    - security-deep
    - threat model
  emit_hints:
    - { command: review, tag: security-deep, description: "security-check 启用 SAST 工具链" }
    - { command: decide, tag: security-deep, description: "强制威胁建模章节" }
