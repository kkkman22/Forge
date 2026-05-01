# React Todo Example Project

This is a React + TypeScript Todo application example managed with the Forge workflow.

## Project Structure

```
react-todo/
├── .forge/              # Forge configuration directory
│   ├── config.md        # Project configuration
│   ├── status.md        # Current status
│   ├── specs/           # Requirement specs
│   └── plans/           # Execution plans
├── src/                 # Source code
└── README.md
```

## Using Forge

### 1. Add a New Feature

```
/forge Add drag-and-drop reordering for Todos
```

Forge analyzes task complexity and suggests an appropriate execution path (Light/Standard/Full).

### 2. Check Project Status

```
/forge status
```

### 3. Execute Development Flow

```
# Standard path
/forge plan .forge/specs/todo-app/spec.md
/forge build .forge/plans/todo-app.md
/forge review
/forge test
/forge ship
```

## Forge Workflow

- **Spec** (`.forge/specs/`): Immutable once locked, ensuring stable requirements
- **Plan** (`.forge/plans/`): Immutable once approved, ensuring stable execution plans
- **Review**: Three-layer review (spec-check, quality-check, security-check)
- **Ship**: Auto-commit after all checks pass

## Tech Stack

- React 18+
- TypeScript (strict mode)
- Vitest (test framework)
