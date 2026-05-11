---
paths:
  - "forge/src/**"
  - "src/**"
---

# TypeScript/JavaScript Conventions

- strict null checks enforced via tsconfig
- import order: std lib → 3rd party → ./relative
- test files co-located as `<name>.test.ts`
- config reading pattern: use `readConfig()` from `src/config.ts`, parse frontmatter with `gray-matter` or `js-yaml`
- prefer early return over nested if/else
- use `const` by default, `let` only when reassignment needed
- no `any` type — use unknown + type guard
- error handling: throw typed errors, catch at boundary
