---
updated: 2026-08-11
description: "Use when running /tinkerman test --ui or when forge-test detects a UI target with designer specs"

dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

# /tinkerman test --ui — UI Harness

> **Trigger**: `/tinkerman test --ui` or forge-test auto-detects UI target
> **Output**: `.tinkerman/findings/<topic>/ui-harness/`

## 1. Overview

4-tier UI harness for verifying web applications through external control. Supports structured a11y snapshots, screenshots, and designer spec comparison.

**Not For**: CLI testing (use `/tinkerman test --cli`), API testing.

## 2. Tier Selection [R6.2]

| Priority | Tier | Detection | Capabilities |
|----------|------|-----------|-------------|
| 1 | project | playwright.config / cypress.config exists | Full test framework |
| 2 | cmux-browser | cmux socket + browser commands | snapshot, screenshot, console |
| 3 | playwright | `require('playwright')` in user project | Full browser automation |
| 4 | cdp | `chrome --remote-debugging-port` | Raw CDP access |

→ Details: references/cmux-browser.md, references/playwright-adapter.md, references/cdp-adapter.md

## 3. Designer Spec Comparison [R6.6]

When `designerSpecPath` exists:
1. Read designer section from spec
2. Generate UI assertions
3. Execute assertions via selected tier
4. Mismatches → `.tinkerman/findings/<topic>/ui-harness/mismatches.md`
5. quality-check reads mismatches on session start (§4.2)

## 4. Artifacts

| File | Content |
|------|---------|
| `snapshot.txt` | a11y/accessibility tree snapshot |
| `screenshot.png` | Visual capture |
| `console.log` | Browser console output |
| `errors.log` | JS errors |
| `mismatches.md` | Designer spec violations [R6.6] |
| `verdict.md` | Three-State Verdict |

## 5. Constraints

- **Forge MUST NOT install browser dependencies** [R6.5]
- Playwright/Cypress use is guarded — only if already in user's devDeps
- `package.json` must not gain new browser-related entries

## 6. Graceful Degradation [R6.8]

All tiers fail → `verdict: INCONCLUSIVE` + record controllers attempted.

## Gotchas
- **Async rendering**: UI not fully rendered when screenshot taken → false negative → wait for specific selector before capture
- **Browser state leak**: Previous test left cookies/state → test interference → use fresh browser context per test
- **Screenshot diff threshold**: Pixel-perfect comparison too strict → font rendering differences → use perceptual diff with tolerance
