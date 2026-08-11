---
updated: 2026-08-11
---
# Playwright Adapter Reference

## Overview

Tier 3 adapter using Playwright for UI verification. Only active when Playwright is installed in user's project devDependencies [R6.5].

## Detection

`require('playwright')` — guarded import. Failure to resolve falls back to next tier.

## Constraints

- Forge's `package.json` MUST NOT add Playwright as dependency [R6.5]
- Uses `require()` not `import` — only resolves if user has Playwright
- All browser automation happens through user's Playwright installation
