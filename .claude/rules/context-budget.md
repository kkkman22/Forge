# Context Budget Management — Cross-Cutting Rules

> Source: Spec 2 — Context Layered Trimming
> Applies to: `/forge plan`, `/forge build`, `/forge review`, `/forge resume`
> Reference: Each skill's instructions.md contains phase-specific integration details.

---

## Context State Classification

When preparing context for any forge phase, classify the current context state using the raw ratio (`tokensUsed / contextWindow`):

| State | Condition | Behavior |
|-------|-----------|----------|
| PEAK | ratio < 0.30 | Best state, no restrictions |
| GOOD | 0.30 ≤ ratio < 0.50 | Normal, all operations allowed |
| WARNING | 0.50 ≤ ratio < 0.70 | Begin trimming low-priority content |
| CRITICAL | ratio ≥ 0.70 | Aggressive trimming + suggest checkpoint |

**Boundary rule**: Use the raw ratio, NOT the rounded percentage. 59.999% is still WARNING, not CRITICAL.

## Trimming Priority Chain

When context enters WARNING or CRITICAL state, trim content in this priority order (drop lowest first):

| Priority | Category | Action |
|----------|----------|--------|
| Drop First | Context files (code file contents, explore results) | Remove entirely |
| Drop Second | Research findings (external docs, web search results) | Remove entirely |
| Keep High | Project context (CLAUDE.md, config.md) | Trim from tail |
| Keep Highest | Spec locked requirements, system instructions | Never trim |
| Proportional Keep | Plan files | Each plan gets proportional share, minimum 1024 bytes, truncate from tail |
| Last to Drop | Requirements and acceptance criteria | Remove only as last resort |

## Token Estimation

```
tokenEstimate(text) = Math.ceil(text.length / 4)
```

Consistency > precision. Always use the same formula so trimming decisions are predictable.

## Trim Transparency

After any trimming, inject the following note so the developer knows what was omitted:

```xml
<note type="context-trim">
Budget: {budget} tokens | Omitted: {omittedList} | Plan truncation: {pct}%
Full content available in .forge/ directory.
</note>
```

## Pressure-Aware Note Reserve

Only reserve 80 tokens for the trim note when in WARNING or CRITICAL state. Do not reserve in PEAK/GOOD states — this avoids unnecessary early drops when context pressure is low.
