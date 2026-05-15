---
title: "Contract Test Must Match async Function Exports"
tags: ["contract-test", "async", "skill-registry", "regex"]
date: "2026-05-15"
confidence: 0.85
---

## Problem Pattern

`skill-function-registry.ts` contract test validates exported functions with regex `export\s+function\s+${name}\s*\(`. This pattern misses `export async function`, causing false failures for any async registered function.

## Solution

Change contract test regex to `export\s+(?:async\s+)?function\s+${name}\s*\(` in both Direction 1 (existence check, line 68) and signature extraction (line 101). The `(?:async\s+)?` optional group handles both sync and async exports.

## Pitfall Record

When `resolveConflicts` (async) was added to the registry, 2 contract tests failed:
- "resolveConflicts is exported from src/conflict-resolver.ts"
- "resolveConflicts has expected parameters"

First attempted removing the registry entry (wrong — Direction 2 requires bidirectional sync). Correct fix was updating the contract test itself to handle async.

## Decision Rationale

Chose fixing the contract test over removing the async entry because: (a) SKILL.md references `resolveConflicts`, so Direction 2 requires it registered; (b) async exports are valid and will appear again; (c) regex fix is a one-line change with zero blast radius.

## Reusable Pattern

Any contract/validation test that inspects source code via regex must account for TypeScript modifiers (`async`, `function*`, `declare`). Pattern: `export\s+(?:async\s+)?(?:function\*\s+)?function\s+${name}`. Test the regex against both sync and async variants before committing.
