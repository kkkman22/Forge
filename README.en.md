# Forge — Unified AI Coding Workflow Framework

[![CI](https://github.com/kkkman22/Forge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kkkman22/Forge/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/badge/security--audit-npm%20audit%20%2B%20deps-blue)](./.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

> **A unified `/forge` entry point + <!-- ssot:begin topic=commands render=count -->38<!-- ssot:end topic=commands --> internal subcommands covering the full development lifecycle, with three-dimensional routing that auto-matches task complexity and a unified state system that is session-aware.**
>
> Prerequisite: Claude Code ≥ 2.1.163 | [Install guide (中文)](docs/quick-start.md)
> Full compatibility matrix and fallback strategy: [docs/claude-code-compatibility.md](docs/claude-code-compatibility.md)

> 📖 **This is the English mirror of [README.md](README.md).** The Chinese version is authoritative; this translation tracks it. Bilingual policy: CN-only docs are allowed by default; EN files declare their CN counterpart via the `mirror_of` frontmatter field (enforced by `check-docs-bilingual`). README + the core reference set are kept bilingual; the rest may stay single-language.

---

## Core Value

- **<!-- ssot:begin topic=commands render=count -->38<!-- ssot:end topic=commands --> commands** covering the full cycle from requirements analysis to code delivery
- **Three-dimensional routing** auto-matches task complexity (Light / Standard / Full)
- **Unified state** directory `.forge/`, with cross-command state awareness and session resume
- **On-demand loading**, ~10K tokens per session
- **TDD enforced** + three-layer independent review, guaranteeing code quality

---

## Quick Start

```bash
# 1. Install (Plugin method, recommended)
claude plugin marketplace add https://github.com/kkkman22/Forge
claude plugin install forge

# 2. Initialize the project (first time only)
/forge init

# 3. Verify the install
/forge status

# 4. First use
/forge fix the typo in the README
```

> Full quick-start guide (3 install methods, troubleshooting, end-to-end example) → [docs/quick-start.md](docs/quick-start.md) (中文)

### Daily development: 90% of scenarios need only 7 commands

After install, the vast majority of workflows are covered by these 7 core commands — no need to memorize every subcommand:

| Command | Purpose |
|---------|---------|
| `/forge` | **Unified entry** — describe the task, auto-routed to the right tier (recommended starting point) |
| `/forge plan` | Break a requirement / Spec into atomic task list |
| `/forge build` | Implement code via TDD against the plan |
| `/forge review` | Three-layer independent review (spec / quality / security) |
| `/forge test` | Run the full verification suite |
| `/forge ship` | Gate checks + merge / release delivery |
| `/forge learn` | Distill lessons into the knowledge base after completion |

> The remaining 31 commands (decide / spec / loop / grill / debug, etc.) trigger on demand in specific scenarios; three-dimensional routing suggests them automatically. Full reference → [docs/reference-commands.md](docs/reference-commands.md)

---

## Three-Dimensional Routing

| Tier | Condition | Command Sequence |
|------|-----------|------------------|
| **Light** | Affects ≤ 1 file and ≤ 20 lines changed | `build → review` |
| **Standard** | Clear requirement or existing Spec | `plan → build → review → test → ship` |
| **Full** | New service / new database / auth change / fuzzy requirement | `decide → spec → plan → build → review → test → ship → learn` |

> Routing principles: user override takes priority; when unsure, pick the heavier tier; once a tier is chosen, its command sequence must run in order.

---

## Security

Forge treats security as engineering discipline from day one. Five defense layers: tool-call Hook frozen-zone hard blocking, shell injection prevention, input threat detection, dependency supply-chain audit, and 145 property-based invariant tests. Sensitive areas are protected by a frozen / protected / open tiering. See [docs/reference-security.md](docs/reference-security.md).

---

## Development

```bash
# Install dependencies
npm install

# Full check (this is what CI runs)
npm run check        # typecheck + lint + test + doc checks (parallel groups)

# Run individually
npm run typecheck    # Type check
npm run lint         # Lint
npm run lint:fix     # Auto-fix
npm run test         # Run tests
npm run test:coverage # Tests + coverage report

# Build the dist bundle
bash scripts/build-dist.sh
```

**Tech stack**: TypeScript 5.9 (strict), 340 TypeScript modules, Vitest 4.1, fast-check 4.7 (property testing), Biome 2.4 (lint + format). Runtime deps: `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`, `commander`, `minimatch`, `yaml`, `zod`.

**Test strategy**: 9178 tests (740 test files) verifying invariants. Coverage ~87% statements.

---

## License

MIT
