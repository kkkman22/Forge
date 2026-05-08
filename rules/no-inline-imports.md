---
name: no-inline-imports
alwaysApply: true
lint_binding:
  biome: "noImportAssignments"
  eslint: "no-dynamic-import"
---

# No Inline Type-Only Imports in Runtime Code

Avoid `import type` assertions mixed into runtime import statements. Use dedicated `import type` statements for type-only imports.

## Why

Mixed imports (`import { foo, type Bar }`) can confuse bundlers and make it unclear which imports have runtime effects. Separating type imports improves code clarity and bundler tree-shaking.

## How to Fix

```typescript
// Bad
import { createContext, type User } from "./types";

// Good
import { createContext } from "./types";
import type { User } from "./types";
```
