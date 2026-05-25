/**
 * multi-agent-review.js — Forge Review Workflow
 *
 * Three-layer code review (spec-check, quality-check, security-check)
 * with adversarial verification and synthesis.
 *
 * Placeholder for Phase 2 integration with WorkflowDispatcher.
 * Currently the L0 path; will be enhanced with chunkedParallel in T2.
 */

export const meta = {
  name: 'multi-agent-review',
  description: 'Multi-agent code review: parallel dimension review, adversarial verification, synthesis.',
  phases: [
    { title: 'Scan', detail: 'scan diff and classify changes' },
    { title: 'Review', detail: 'parallel dimension review' },
    { title: 'Verify', detail: 'adversarial verification of findings' },
    { title: 'Synthesize', detail: 'merge findings into final report' },
  ],
};

// Workflow body — executed by Claude Code Workflow Runtime via bp()
// phase('Scan')
// const changes = await agent('scan diff for changed files and patterns', { schema: CHANGES_SCHEMA })
// ...
// return { summary, stats, findings, ship_ready, recommendation }
