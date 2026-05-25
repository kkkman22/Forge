/**
 * multi-agent-review.js — Forge Review Workflow
 *
 * Three-layer code review (spec-check, quality-check, security-check)
 * with adversarial verification and synthesis.
 *
 * Loaded by the Claude Code Workflow runtime via `bp()`. The runtime calls
 * `run(bp, ctx)` where `bp` exposes phase/agent/log/return primitives.
 *
 * Concurrency is bridged through chunkedParallel() (workflows/lib/concurrency.js)
 * to honor FORGE_MAX_PARALLEL_AGENTS / FORGE_REVIEW_CONCURRENCY env caps.
 *
 * Forge's L1 fallback path (Agent tool / runReviewFallbackLadder) covers any
 * environment where this workflow runtime is unavailable —
 * see .claude/rules/workflow-fallback-ladder.md.
 *
 * Contract:
 *   inputs:  ctx.diffSummary?, ctx.changedFiles?
 *   outputs: { summary, stats, findings, ship_ready, recommendation, methodology }
 */

import { chunkedParallel } from './lib/concurrency.js';

export const meta = {
  name: 'multi-agent-review',
  version: '1.1.0',
  description:
    'Multi-agent code review: parallel dimension review, adversarial verification, synthesis.',
  phases: [
    { title: 'Scan', detail: 'scan diff and classify changes' },
    { title: 'Review', detail: 'parallel dimension review across spec/quality/security' },
    { title: 'Verify', detail: 'adversarial verification of findings' },
    { title: 'Synthesize', detail: 'merge findings into final report' },
  ],
};

const REVIEWERS = [
  {
    id: 'spec-check',
    subagent: 'spec-check',
    layer: 1,
    focus:
      'Requirement coverage, acceptance criteria fulfillment, scope-creep beyond spec; severity P0=unimplemented, P1=AC unmet, P2=scope creep, P3=doc inconsistency.',
  },
  {
    id: 'quality-check',
    subagent: 'quality-check',
    layer: 2,
    focus:
      'Naming, error handling, performance, code duplication, test coverage, maintainability; severity P0=production crash risk, P1=significant maintenance burden, P2=code smell, P3=nit.',
  },
  {
    id: 'security-check',
    subagent: 'security-check',
    layer: 3,
    focus:
      'Hardcoded secrets, injection vectors, unsafe deps, permission boundary violations, sensitive data; severity P0=secret leak/RCE, P1=SQLi/XSS class, P2=info disclosure, P3=hardening.',
  },
];

const FINDING_SCHEMA = {
  type: 'object',
  required: ['severity', 'file', 'line', 'issue', 'evidence'],
  properties: {
    severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
    file: { type: 'string' },
    line: { type: 'integer' },
    issue: { type: 'string' },
    evidence: { type: 'string' },
  },
};

const SCAN_SCHEMA = {
  type: 'object',
  required: ['changed_files', 'change_summary', 'risk_level'],
  properties: {
    changed_files: { type: 'array', items: { type: 'string' } },
    change_summary: { type: 'string' },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
};

/**
 * Workflow entry point — invoked by Claude Code Workflow runtime via `bp()`.
 *
 * @param {object} bp - blueprint helpers (phase, agent, log, return)
 * @param {object} [ctx] - optional inputs (diffSummary, changedFiles)
 * @returns {Promise<object>}
 */
export async function run(bp, ctx = {}) {
  const { phase, agent, log } = bp;

  // -------------------------------------------------------------------------
  // Phase 1: Scan
  // -------------------------------------------------------------------------
  const scanResult = await phase('Scan', async () => {
    log('Scanning diff and classifying changes…');
    const result = await agent('explore', {
      prompt: `Run \`git diff main...HEAD\` to identify changed files. Output JSON {changed_files: string[], change_summary: string (1-2 sentences), risk_level: low|medium|high}. Risk is high if change touches auth, data layer, public API, infra config.`,
      changedFiles: ctx.changedFiles ?? [],
      schema: SCAN_SCHEMA,
    });
    return result?.output ?? { changed_files: [], change_summary: '', risk_level: 'low' };
  });
  log(
    `Scan: ${scanResult.changed_files.length} files at risk_level=${scanResult.risk_level}`,
  );

  // -------------------------------------------------------------------------
  // Phase 2: Parallel Review (chunked to honor concurrency cap)
  // -------------------------------------------------------------------------
  const dimensionResults = await phase('Review', async () => {
    return chunkedParallel(
      REVIEWERS.map((reviewer) => async () => {
        log(`▶ Layer ${reviewer.layer}: ${reviewer.id}`);
        const result = await agent(reviewer.subagent, {
          prompt: `${reviewer.focus}\n\nDiff context:\n${ctx.diffSummary ?? scanResult.change_summary}\n\nFor each issue produce a finding with severity, file, line, issue summary, and code evidence (cited line range).`,
          changedFiles: ctx.changedFiles ?? scanResult.changed_files,
          schema: { type: 'array', items: FINDING_SCHEMA },
        });
        return {
          dimension: reviewer.id,
          layer: reviewer.layer,
          findings: result?.findings ?? result?.output ?? [],
        };
      }),
    );
  });
  const allFindings = dimensionResults.flatMap((d) =>
    (d.findings ?? []).map((f) => ({ ...f, dimension: d.dimension })),
  );
  log(
    `Review: ${allFindings.length} raw findings across ${dimensionResults.length} dimensions`,
  );

  // -------------------------------------------------------------------------
  // Phase 3: Adversarial Verify
  // -------------------------------------------------------------------------
  const verified = await phase('Verify', async () => {
    if (allFindings.length === 0) {
      return { confirmed: [], rejected: [] };
    }
    const result = await agent('critic', {
      prompt: `Adversarially verify each finding by reading the cited file:line. Confirm if it's a real issue at the stated severity, or reject as false-positive / wrong severity. Output {confirmed: Finding[], rejected: Finding[]}.`,
      findings: allFindings,
      schema: {
        type: 'object',
        required: ['confirmed', 'rejected'],
        properties: {
          confirmed: { type: 'array' },
          rejected: { type: 'array' },
        },
      },
    });
    return {
      confirmed: result?.confirmed ?? allFindings,
      rejected: result?.rejected ?? [],
    };
  });
  log(
    `Verify: ${verified.confirmed.length} confirmed, ${verified.rejected.length} rejected`,
  );

  // -------------------------------------------------------------------------
  // Phase 4: Synthesize
  // -------------------------------------------------------------------------
  const stats = computeStats(verified.confirmed);
  const shipReady = stats.P0 === 0 && stats.P1 === 0;

  const synthesized = await phase('Synthesize', async () => {
    const result = await agent('explore', {
      prompt: `Write a 2-3 sentence summary of the review and a recommendation (e.g., "fix P0/P1 then re-review" if blocked). Use the confirmed findings and stats. Output {summary: string, recommendation: string}.`,
      stats,
      shipReady,
      findings: verified.confirmed,
      schema: {
        type: 'object',
        required: ['summary', 'recommendation'],
        properties: {
          summary: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    });
    return {
      summary: result?.summary ?? `Review complete: ${verified.confirmed.length} findings.`,
      recommendation:
        result?.recommendation ??
        (shipReady ? 'No P0/P1; proceed to test/ship.' : 'Resolve P0/P1 before ship.'),
    };
  });

  // bp.return is the workflow runtime's terminator; equivalent to `return`
  // in the runtime VM. Returning normally also works.
  return {
    summary: synthesized.summary,
    recommendation: synthesized.recommendation,
    stats,
    findings: verified.confirmed,
    ship_ready: shipReady,
    methodology: 'workflow',
    raw_stats: {
      scan_risk_level: scanResult.risk_level,
      files_scanned: scanResult.changed_files.length,
      raw_findings: allFindings.length,
      confirmed_findings: verified.confirmed.length,
      rejected_findings: verified.rejected.length,
    },
  };
}

function computeStats(findings) {
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity]++;
  }
  return counts;
}

// Default export for runtimes that prefer it
export default run;
