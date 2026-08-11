---
updated: 2026-08-11
title: "Runner Selection Reference"
version: "1.0"
---

# Runner Selection Strategy

## Type Classification

Scenarios are classified by keyword matching in Given/When/Then text:

| Type | Keywords | Runner |
|------|----------|--------|
| `api` | endpoint, request, response, HTTP methods, curl, fetch | apiRunner (curl-based) |
| `ui` | click, button, page, navigate, visible, modal, screenshot | uiRunner (cmux browser) |
| `cli` | terminal, bash, shell, exit code, stdout, stderr | cliRunner (bash exec) |
| `mixed` | Combination of API + UI keywords | mixedRunner (sequential) |
| `unknown` | No matching keywords | SKIP with reason |

## Runner Dispatch

First runner where `supports(scenario)` returns true is used. No matching runner → verdict=SKIP.

## API Runner

1. Extract endpoint from Given clause
2. Extract HTTP method from When clause (default: GET)
3. Execute curl, capture status code
4. Assert against Then clause

## UI Runner

Requires Tier B availability (cmux browser). Otherwise → SKIP.
Uses frontend-check infrastructure for browser automation.

## CLI Runner

1. Extract command from When clause
2. Execute via bash, capture stdout/stderr/exit code
3. Assert against Then clause

## Mixed Runner

Phase 2 — decomposes into UI pre-steps → API assertion → UI post-verification.
