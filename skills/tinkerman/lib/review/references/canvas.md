---
updated: 2026-08-11
---
# Canvas Output Reference

> **Attribution**: Canvas rendering pattern adapted from [cursor-team-kit](https://github.com/getcursor/cursor-team-kit) open-source review visualization concepts [R4.10].

## Overview

The `--canvas` flag generates a single-page dark-themed HTML artifact with a three-column layout for review findings. Each column corresponds to a review layer:

| Column | Layer | Findings Source |
|--------|-------|----------------|
| Spec Alignment | Layer 1 | `CanvasFindings.spec` |
| Code Quality | Layer 2 | `CanvasFindings.quality` |
| Security & Risk | Layer 3 | `CanvasFindings.security` |

## Architecture

### Template System

- `templates/canvas/base.html.tmpl` — HTML skeleton with dark CSS
- `templates/canvas/renderer.js.tmpl` — Client-side rendering logic

Fallback: if templates are missing, `loadTemplate()` returns a minimal inline template.

### JSON Island [R4.8]

Findings are embedded via a `<script type="application/json">` block (inert — not executed by browsers). The data is HTML-escaped before embedding to prevent XSS:

```
escapeHtml(JSON.stringify(findings))
```

### Bitbucket MCP Enrichment [R4.3]

Optional enrichment via `tryFetchEnrichment()`. On failure (timeout, 401, 500, or MCP unavailable), gracefully degrades to a footer notice. Canvas output is always complete regardless of enrichment status.

## Security

- All finding text is rendered via `textContent` (not `innerHTML`) in the client-side renderer
- The JSON island uses `type="application/json"` — browsers do not execute this script type
- `escapeHtml()` escapes `&`, `<`, `>`, `"` before embedding
- No finding text reaches the DOM as parsed HTML

## Output

- **Path**: `.tinkerman/reviews/<topic>.canvas.html`
- **Format**: Self-contained HTML (no external dependencies)
- **Opened**: Directly in any browser — no server required

## Implementation Files

| File | Purpose |
|------|---------|
| `src/canvas-renderer.ts` | Core renderer with `renderCanvas()` |
| `src/bitbucket-mcp-adapter.ts` | Optional enrichment adapter |
| `src/secret-redactor.ts` | Secret redaction for embedded data |
| `templates/canvas/*.tmpl` | HTML and JS templates |

## Error Handling

- Missing review file → throws with actionable message
- Missing templates → inline fallback template
- Bitbucket MCP failure → graceful degradation, null enrichment
- Empty findings → renders "No findings" placeholder in each column
