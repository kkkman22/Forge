[← Back to Index](./INDEX.en.md) | [中文版](./onboarding-advanced.md)

> ⚠️ This translation may be behind the Chinese version. Chinese last updated: 2026-05-12

# Forge Advanced User / Contributor Onboarding

> **Estimated learning time**: ~30 minutes
> **Prerequisites**: Mastered standard path, have read [onboarding-daily.en.md](./onboarding-daily.en.md)

---

## Are You an Advanced User?

This path is for you if:

- You've completed the standard path multiple times
- You need to handle complex, ambiguous, or architecture-level tasks
- You want to contribute code or extend Forge functionality
- You're interested in Forge Loop, Domain Packs, knowledge system, and other advanced features

---

## Full Path

### Differences from Standard Path

| | Standard Path | Full Path |
|--|---------------|-----------|
| **Applies to** | Clear requirements | Ambiguous requirements or architecture changes |
| **Extra stages** | None | decide → spec |
| **Post stages** | None | learn |
| **Complete sequence** | plan → build → review → test → ship | **decide → spec → plan → build → review → test → ship → learn** |

### decide — Four-Perspective Decision

**Purpose**: Examine the task from multiple perspectives before implementation.

**Command**:

```bash
/forge decide
```

**Four Perspectives**:

| Perspective | Focus | Output |
|-------------|-------|--------|
| Product | User value, competitive comparison | Feature priority suggestions |
| Architecture | Tech choices, scalability | Architecture risk assessment |
| Security | Threat model, data flow | Security considerations |
| Design | UI/UX impact (if applicable) | Design suggestions |

**Output**: `.forge/decisions/ADR-*.md` — Architecture Decision Records

### spec — Specification Lock

**Purpose**: Solidify ambiguous requirements into lockable specification documents.

**Command**:

```bash
/forge spec
# Or import from external file
/forge spec requirements.md
```

**Output**: `.forge/specs/<feature>/spec.md`

**Lock mechanism**: Once locked, spec enters frozen zone — AI cannot modify (unless user explicitly unlocks).

### learn — Knowledge Capture

**Purpose**: Extract experience from this development session into the knowledge base.

**Command**:

```bash
/forge learn
```

**Five dimensions**:

1. **Problem Patterns** — What recurring problems were encountered?
2. **Solutions** — How were they solved?
3. **Pitfall Records** — Which assumptions were wrong?
4. **Decision Rationale** — Why were key decisions made this way?
5. **Reusable Patterns** — Which patterns can be reused in other tasks?

**Output**: `.forge/knowledge/solutions/*.md` + updated `instincts.md`

---

## Knowledge System

### Knowledge Base Structure

```
.forge/knowledge/
├── catalog.md           # Panoramic index (entry point)
├── instincts.md         # Experience pattern library (confidence scoring)
├── known-failures.md    # Known failure patterns
├── metrics.md           # Metrics tracking
├── tool-health.md       # Tool health monitoring
├── skill-feedback.md    # SKILL execution feedback
├── solutions/           # Solution documents
│   └── <topic>.md
└── sessions/            # Session logs
    └── <date>-<topic>.md
```

### Knowledge Base Limits

- Default limit: **20 documents**
- Patterns with confidence < 0.3 auto-cleaned
- High-frequency patterns written to `instincts.md`

### Knowledge Backflow

- `/forge plan` auto-searches relevant experience
- `/forge build` auto-searches historical pitfall records

---

## Forge Loop

Forge Loop is an **autonomous execution engine** independent of the `/forge` command.

### Differences from `/forge`

| | `/forge` | `forge-loop` |
|--|----------|--------------|
| **Runtime** | Inside Claude Code conversation | System terminal |
| **Interaction** | Human-AI collaboration | Unattended |
| **Applies to** | Tasks needing decisions | Batch/repetitive tasks |

### Quick Start

```bash
# 1. Clone install (distribution package excludes Forge Loop)
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
cd ~/.claude/skills/forge

# 2. Install dependencies and compile
npm install && npx tsc

# 3. Run
forge-loop "add input validation to all API endpoints"
```

See [reference-advanced.md](./reference-advanced.md) for complete Forge Loop documentation.

---

## Domain Pack

Domain Packs provide out-of-the-box domain knowledge for specific industries.

### PMS Domain Pack (Hotel Management System)

```bash
# Enable
/forge init --pack pms
```

**Includes**:
- 8 bounded context glossaries
- 4 state machines (YAML-defined)
- 20 Gherkin scenarios
- BusinessDayClock business day calendar

See `packs/pms/README.md` for details.

---

## Contributing Guide

### How to Contribute

1. **Fork repo** → Create feature branch → Submit PR
2. **Follow Forge workflow**: Even when contributing to Forge itself,建议使用 `/forge`
3. **Atomic commits**: One commit per logical change
4. **Conventional Commits**: `type(scope): description`

### Development Environment

```bash
# Install dependencies
npm install

# Run tests
npm run check    # tsc + biome + vitest + script checks

# Compile TypeScript
npx tsc

# Build distribution package
bash scripts/build-dist.sh
```

### Adding New Skills

```
skills/
└── forge-<name>/
    ├── SKILL.md          # Skill definition (≤150 lines)
    └── references/       # Detailed reference docs
        └── *.md
```

Requirements:
- SKILL.md must include `name`, `description` frontmatter
- Use `disable-model-invocation: true` to prevent direct invocation
- Put detailed content in `references/`

---

## Hands-On Exercise: Complete a Full Path

### Goal

Use the full path to evaluate adding a new command to Forge.

### Starting State

- Mastered standard path
- On feature branch

### Steps

1. **Start decide**

   ```bash
   /forge decide
   # Task: Add "/forge backup" command for backing up .forge/ state
   ```

2. **Review decision report**
   - View four-perspective analysis
   - Confirm architecture risk is acceptable

3. **Execute spec → plan**
   - Forge auto-generates spec and plan
   - Review and approve plan

4. **Complete build → review → test → ship**
   - Observe auto-advance

5. **Execute learn**
   - Extract experience from this development
   - Check knowledge base updates

### Expected Result

- ADR decision record
- Locked spec document
- Approved plan
- Implementation code + tests
- Knowledge base update

---

## Continue Exploring

- **[Complex Requirement Workflow → workflow-complex.md](./workflow-complex.md)** — View complete full path example
- **[Architecture Reference → reference-architecture.md](./reference-architecture.md)** — Deep dive into internal mechanisms
- **[Security Reference → reference-security.md](./reference-security.md)** — Understand security mechanism details
