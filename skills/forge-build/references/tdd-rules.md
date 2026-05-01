# TDD Iron Rules (Detailed)

## 4. TDD Iron Rules

→ Follow CLAUDE.md §2.1 TDD Enforcement (RED → GREEN → REFACTOR cannot be skipped)

**Build Phase Additions**:

- **In-Subagent TDD**: Each Subagent independently executes the full TDD cycle. Code written before tests → delete code, restart from tests. Do not retain, reference, or read deleted code.
- **Run at every step**: RED confirms failure, GREEN confirms pass, REFACTOR confirms no regression. Test passing at RED stage = test was written wrong.
- **Tests accommodating code ≠ code satisfying requirements**. Writing code first then adding tests is the former.
- **Dead Code Hygiene**: REFACTOR 完成后，扫描是否产生了孤儿代码（未使用的 import、未调用的函数或方法、未引用的类型定义、未使用的变量）。发现孤儿代码时记录到 `.forge/findings/<topic>.md`，不自行删除——删除需要确认代码确实不再被需要。

## Simplicity Check

GREEN 阶段的代码必须是"能让测试通过的最简单实现"。如果你在 GREEN 阶段引入了抽象层、工厂模式或配置驱动的设计——停下来，删掉，写更简单的版本。

REFACTOR 阶段才是引入抽象的时机，且仅当同一模式重复出现 3 次以上时。

**简洁性检查**：
- ✗ 为一个通知场景构建通用 EventBus + 中间件管线 → ✓ 直接函数调用
- ✗ 为两个相似组件构建抽象工厂 → ✓ 两个直接的组件 + 共享工具函数
- ✗ 为三个表单构建配置驱动的表单生成器 → ✓ 三个表单组件

三行相似的代码好过一个过早的抽象。先实现朴素的、显然正确的版本。
