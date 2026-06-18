---
title: Forge Quick Start Guide
category: getting-started
audience:
- maintainer
updated: 2026-06-18
owner: forge-maintainers
---

[← Back to Index](./INDEX.en.md) | [中文版](./quick-start.md)

> ⚠️ This translation may be behind the Chinese version. Chinese last updated: 2026-05-12

# Forge Quick Start Guide

## Prerequisites

- **Claude Code** ≥ 2.1.163
  - Check: `claude --version`
- **Node.js** ≥ 20 (only needed for Forge Loop)
  - Check: `node --version`

Estimated time: **5 minutes**

---

## 5 Steps to Get Started

### Step 1: Install Forge

Choose one of the three methods:

#### Method 1: Plugin Install (Recommended)

```bash
claude plugin marketplace add https://github.com/kkkman22/Forge
claude plugin install forge
```

> `/forge` and subcommands available immediately after install.

#### Method 2: Direct Clone (Forge Loop Developers)

```bash
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
```

> For Forge Loop, additionally run `npm install && npx tsc`.

#### Method 3: Distribution Package (Enterprise)

```bash
git clone https://github.com/kkkman22/Forge.git /tmp/forge
bash /tmp/forge/scripts/build-dist.sh
bash /tmp/forge/scripts/install-dist.sh
```

> Only includes `/forge` command, no Forge Loop.

### Step 2: Initialize Project

```bash
~/.claude/skills/forge/scripts/init.sh
```

> Expected output: `.forge/` directory created with `config.md` and `status.md`.

### Step 3: Verify Installation

```bash
/forge status
```

> Expected output: Current task status shows `"completed"`, no active task.

### Step 4: First Use (Lightweight Path Example)

```bash
/forge fix the typo in README
```

> Forge automatically selects lightweight path `build → review`, then shows fix results.

### Step 5: First Full Delivery (Standard Path Example)

```bash
/forge add a description field to package.json
```

> Forge automatically selects standard path `plan → build → review → test → ship`, executing stages with auto-advance.

---

## End-to-End Examples

### Example 1: Lightweight Path — Bug Fix

```bash
# User input
/forge fix the sorting bug on user list page

# Forge output summary:
# → Analyzes task complexity: lightweight path
# → Executes build: modifies src/user-list.ts (1 file, 3 lines)
# → Executes review: no P0/P1, passes
# → Complete, suggests commit message
```

### Example 2: Standard Path — New Feature

```bash
# User input
/forge add pagination parameters to user API

# Forge output summary:
# → Analyzes task complexity: standard path
# → Executes plan: generates .forge/plans/pagination.md
# → Executes build: creates src/pagination.ts + test/pagination.test.ts
# → Executes review: three-layer review passes
# → Executes test: npm run check passes
# → Executes ship: suggests merge options
```

---

## Troubleshooting

### Scenario 1: Claude Code Version Too Low

**Symptom**: `/forge` returns "Unknown skill" or error.

**Cause**: Claude Code version below 2.1.153, Skill system not supported.

**Fix**:

```bash
claude update
# Or reinstall
npm install -g @anthropics/claude-code
```

### Scenario 2: Init Script Permission Denied

**Symptom**: `bash: ~/.claude/skills/forge/scripts/init.sh: Permission denied`

**Cause**: Scripts lack execute permission after clone.

**Fix**:

```bash
chmod +x ~/.claude/skills/forge/scripts/init.sh
bash ~/.claude/skills/forge/scripts/init.sh
```

### Scenario 3: `/forge` Command Not Recognized

**Symptom**: No response or error after typing `/forge`.

**Cause**: Installation path not in Claude Code's Skill search path.

**Fix**:

```bash
# Check installation path
ls ~/.claude/skills/forge/skills/forge/SKILL.md

# If missing, re-clone to correct location
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
```

---

## Next Steps

Choose your onboarding path based on intent:

- **[First-time user → onboarding-beginner.en.md](./onboarding-beginner.en.md)** — Learn Forge basics and common commands
- **[Daily developer → onboarding-daily.en.md](./onboarding-daily.en.md)** — Master each stage of the standard workflow
- **[Advanced user → onboarding-advanced.en.md](./onboarding-advanced.en.md)** — Dive into full path, knowledge system, and contribution guide
