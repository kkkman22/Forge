---
name: no-any-cast
alwaysApply: true
lint_binding:
  biome: "noExplicitAny"
  eslint: "@typescript-eslint/no-explicit-any"
---

# No `as any` or `<any>` Casts

Do not use `as any` or `<any>` type assertions to suppress TypeScript compiler errors. If a type mismatch exists, fix the type properly or use a more specific type assertion.

## Why

`as any` disables type checking for the affected expression, masking real type errors. It violates TypeScript's safety guarantees and makes refactoring unsafe.

## Acceptable Alternatives

- Use `unknown` and narrow with type guards
- Use proper type generics
- Use `satisfies` operator for type validation without widening
- For truly unavoidable cases, document why with a comment explaining the constraint

## Examples

```typescript
// Bad — suppresses a real type error
const result = data as any;

// Good — narrow with type guard
const result: unknown = data;
if (typeof result === "string") { ... }

// Good — proper generic
function parse<T>(input: string): T { ... }
```
