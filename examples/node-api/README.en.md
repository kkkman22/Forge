# Node.js API Example Project

This is a Node.js + Express + TypeScript REST API example managed with the Forge workflow.

## Project Structure

```
node-api/
├── .forge/              # Forge configuration directory
│   ├── config.md        # Project configuration
│   ├── status.md        # Current status
│   ├── specs/           # Requirement specs
│   └── plans/           # Execution plans
├── src/                 # Source code
└── README.md
```

## Using Forge

### 1. Add a New API Endpoint

```
/forge Add search and sorting to the user API
```

### 2. Check Project Status

```
/forge status
```

### 3. Execute Development Flow

```
# Standard path
/forge plan .forge/specs/user-api/spec.md
/forge build .forge/plans/user-api.md
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

- Node.js 20+
- Express 4.x
- TypeScript (strict mode)
- Vitest (test framework)
