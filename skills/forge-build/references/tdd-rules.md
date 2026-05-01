# TDD Iron Rules (Detailed)

## 4. TDD Iron Rules

→ Follow CLAUDE.md §2.1 TDD Enforcement (RED → GREEN → REFACTOR cannot be skipped)

**Build Phase Additions**:

- **In-Subagent TDD**: Each Subagent independently executes the full TDD cycle. Code written before tests → delete code, restart from tests. Do not retain, reference, or read deleted code.
- **Run at every step**: RED confirms failure, GREEN confirms pass, REFACTOR confirms no regression. Test passing at RED stage = test was written wrong.
- **Tests accommodating code ≠ code satisfying requirements**. Writing code first then adding tests is the former.
