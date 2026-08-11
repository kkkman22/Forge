---
title: "Frontend Check — Tier C Workflow"
version: "1.0"
updated: 2026-08-11
---

# Tier C — chrome-devtools MCP Core Web Vitals

Prerequisites: `detectTierAvailability().c === "available"` (MCP chrome-devtools responsive).

## Performance Trace Workflow

```typescript
// Pseudocode — executed by the frontend-check agent via MCP tools

// 1. Navigate to target page
await mcp.navigate_page({ url: "http://localhost:5173" });

// 2. Start performance trace with page reload
const trace = await mcp.performance_start_trace({
  autoStop: true,
  reload: true,
});

// 3. Analyze key insights
const insights = await Promise.all([
  mcp.performance_analyze_insight({
    insightSetId: trace.setId,
    insightName: "LCPBreakdown",
  }),
  mcp.performance_analyze_insight({
    insightSetId: trace.setId,
    insightName: "CLSCulprits",
  }),
  mcp.performance_analyze_insight({
    insightSetId: trace.setId,
    insightName: "RenderBlocking",
  }),
  mcp.performance_analyze_insight({
    insightSetId: trace.setId,
    insightName: "DocumentLatency",
  }),
]);

// 4. Extract Core Web Vitals
return parseCoreWebVitals(insights);
```

## Core Web Vitals Thresholds

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP (Largest Contentful Paint) | ≤ 2.5s | 2.5s - 4.0s | > 4.0s |
| INP (Interaction to Next Paint) | ≤ 200ms | 200ms - 500ms | > 500ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | 0.1 - 0.25 | > 0.25 |
| FCP (First Contentful Paint) | ≤ 1.8s | 1.8s - 3.0s | > 3.0s |
| TTFB (Time to First Byte) | ≤ 800ms | 800ms - 1800ms | > 1800ms |
| TBT (Total Blocking Time) | ≤ 200ms | 200ms - 600ms | > 600ms |

## Result Structure

```typescript
interface CoreWebVitalsResult {
  lcp: { value: number; rating: "good" | "needs-improvement" | "poor" };
  inp: { value: number; rating: "good" | "needs-improvement" | "poor" };
  cls: { value: number; rating: "good" | "needs-improvement" | "poor" };
  fcp: { value: number; rating: "good" | "needs-improvement" | "poor" };
  ttfb: { value: number; rating: "good" | "needs-improvement" | "poor" };
  tbt: { value: number; rating: "good" | "needs-improvement" | "poor" };
  insights: {
    renderBlocking: string[];
    clsCulprits: string[];
    lcpBreakdown: string[];
  };
}
```

## Error Handling

- MCP unresponsive → degrade to A+B, skip Tier C
- Trace timeout → report partial results
- Page requires auth → note in output, skip performance trace
