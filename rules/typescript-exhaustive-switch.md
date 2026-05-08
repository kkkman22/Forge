---
name: typescript-exhaustive-switch
alwaysApply: true
lint_binding:
  biome: "noUselessSwitchCase"
  eslint: "@typescript-eslint/switch-exhaustiveness-check"
---

# Exhaustive Switch Statements

TypeScript `switch` statements on union types MUST be exhaustive. Every union member must have a corresponding `case`, or the switch must include a `default` that handles remaining cases via `never` type narrowing.

## Why

Non-exhaustive switches silently ignore new union members added later, creating bugs that TypeScript's type system could have caught.

## How to Fix

Add a `default` case that assigns the matched value to a `never`-typed variable:

```typescript
function handle(action: Action): void {
  switch (action.type) {
    case "create": return handleCreate(action);
    case "delete": return handleDelete(action);
    default: {
      const _: never = action;
      throw new Error(`Unhandled action: ${_}`);
    }
  }
}
```
