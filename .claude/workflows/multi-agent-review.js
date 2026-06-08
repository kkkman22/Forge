export const meta = {
  name: 'multi-agent-review',
  description: 'Comprehensive multi-agent code review: parallel dimension review (spec, quality, security, architecture) → adversarial verification → synthesis',
  whenToUse: 'Thorough code review of the current branch with independent perspectives and verified findings',
  phases: [
    { title: 'Scan', detail: 'Detect changed files and diff scope' },
    { title: 'Review', detail: 'Parallel multi-dimension review' },
    { title: 'Verify', detail: 'Adversarial verification of findings' },
    { title: 'Synthesize', detail: 'Merge, dedupe, and prioritize' },
  ],
}

// --- Schemas ---

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique finding ID like SEC-1, QL-3' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          file: { type: 'string' },
          line: { type: 'number' },
          description: { type: 'string' },
          suggestion: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['id', 'title', 'severity', 'file', 'description', 'confidence'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    confirmed: { type: 'boolean' },
    reason: { type: 'string' },
    adjusted_severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: 'Only set if different from original' },
  },
  required: ['confirmed', 'reason'],
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Overall review summary in 2-3 sentences' },
    stats: {
      type: 'object',
      properties: {
        total_findings: { type: 'number' },
        confirmed: { type: 'number' },
        refuted: { type: 'number' },
        by_severity: {
          type: 'object',
          properties: {
            P0: { type: 'number' },
            P1: { type: 'number' },
            P2: { type: 'number' },
            P3: { type: 'number' },
          },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          dimension: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          description: { type: 'string' },
          suggestion: { type: 'string' },
          verdict: { type: 'string' },
        },
        required: ['id', 'dimension', 'title', 'severity', 'file', 'description', 'verdict'],
      },
    },
    ship_ready: { type: 'boolean', description: 'true if no P0/P1 findings remain' },
    recommendation: { type: 'string', description: 'One of: ship, fix-before-ship, needs-major-rework' },
  },
  required: ['summary', 'stats', 'findings', 'ship_ready', 'recommendation'],
}

// --- Phase 1: Scan ---

phase('Scan')

const diffInfo = await agent(
  `Analyze the current git branch for review scope. Run these commands and report results:
  1. git diff --name-only origin/main...HEAD (or main...HEAD if no origin) — list all changed files
  2. git diff --stat origin/main...HEAD — show change statistics
  3. git log --oneline origin/main...HEAD — show commit history
  4. Identify the primary languages, frameworks, and change categories (new files, modified, deleted)

  Report as structured text with clear sections. If no branch diff is available, report "no changes" and list staged/unstaged changes instead.`,
  { label: 'scan-diff', schema: {
    type: 'object',
    properties: {
      changed_files: { type: 'array', items: { type: 'string' } },
      total_lines_added: { type: 'number' },
      total_lines_removed: { type: 'number' },
      commits: { type: 'number' },
      languages: { type: 'array', items: { type: 'string' } },
      has_changes: { type: 'boolean' },
    },
    required: ['changed_files', 'has_changes'],
  }}
)

if (!diffInfo || !diffInfo.has_changes || diffInfo.changed_files.length === 0) {
  log('No changes detected on current branch. Review is a no-op.')
  return { summary: 'No changes to review.', findings: [], ship_ready: true, recommendation: 'ship' }
}

log(`Scanned ${diffInfo.changed_files.length} files across ${diffInfo.commits} commits (+${diffInfo.total_lines_added}/-${diffInfo.total_lines_removed})`)

// --- Phase 2: Parallel Multi-Dimension Review ---

phase('Review')

const fileContext = `Changed files:\n${diffInfo.changed_files.join('\n')}\n(+${diffInfo.total_lines_added}/-${diffInfo.total_lines_removed} lines, ${diffInfo.commits} commits)`

const REVIEW_DIMENSIONS = [
  {
    key: 'spec',
    label: 'review:spec',
    prompt: `You are a spec alignment reviewer. Review the current branch changes against project requirements.

${fileContext}

Check:
1. Does the implementation match what was requested? (Check CLAUDE.md, .forge/specs/, .forge/progress/ for requirements)
2. Are all scenarios and edge cases covered?
3. Is there scope creep — features added beyond what was specified?
4. Are there missing implementations for specified requirements?

For each finding, assign severity:
- P0: Missing critical requirement (blocks release)
- P1: Missing important scenario or significant scope creep
- P2: Minor missing edge case or minor scope creep
- P3: Suggestion for better alignment`,
    agentType: 'spec-check',
  },
  {
    key: 'quality',
    label: 'review:quality',
    prompt: `You are a code quality reviewer. Review the current branch changes for quality issues.

${fileContext}

Check:
1. Naming consistency and clarity
2. Error handling completeness and correctness
3. Performance issues (N+1 queries, unnecessary allocations, missing indexes)
4. Test coverage gaps — are new behaviors tested?
5. Code duplication and DRY violations
6. Maintainability concerns (complexity, coupling)
7. Dead code or unused imports

For each finding, assign severity:
- P0: Critical bug or data loss risk
- P1: Major quality issue affecting reliability or performance
- P2: Moderate quality issue
- P3: Style or minor improvement`,
    agentType: 'quality-check',
  },
  {
    key: 'security',
    label: 'review:security',
    prompt: `You are a security reviewer. Review the current branch changes for security vulnerabilities.

${fileContext}

Check against OWASP Top 10 and STRIDE threat model:
1. Hardcoded secrets, API keys, credentials
2. Injection risks (SQL, command, XSS, path traversal)
3. Insecure dependencies or outdated crypto
4. Permission boundary violations
5. Sensitive data exposure in logs, errors, or responses
6. Input validation gaps
7. Authentication/authorization bypass risks

For each finding, assign severity:
- P0: Exploitable vulnerability (blocks release)
- P1: Significant security concern requiring immediate attention
- P2: Security improvement needed
- P3: Defense-in-depth suggestion`,
    agentType: 'security-check',
  },
  {
    key: 'arch',
    label: 'review:architecture',
    prompt: `You are an architecture reviewer. Review the current branch changes for architectural concerns.

${fileContext}

Check:
1. Pattern consistency with existing codebase conventions
2. Proper separation of concerns
3. Dependency direction correctness (no circular deps, no depending on unstable layers)
4. Interface design and API contract stability
5. Scalability implications of the changes
6. Backwards compatibility concerns
7. Technical debt introduced or missed opportunity to pay down

For each finding, assign severity:
- P0: Architectural violation causing systemic issues
- P1: Significant design concern affecting maintainability
- P2: Moderate architectural concern
- P3: Minor improvement suggestion`,
    agentType: 'architect',
  },
]

const reviewResults = await parallel(
  REVIEW_DIMENSIONS.map(dim => () =>
    agent(dim.prompt, { label: dim.label, phase: 'Review', schema: FINDING_SCHEMA, agentType: dim.agentType })
  )
)

const allFindings = reviewResults
  .filter(Boolean)
  .flatMap((result, i) =>
    (result.findings || []).map(f => ({
      ...f,
      dimension: REVIEW_DIMENSIONS[i].key,
      original_severity: f.severity,
    }))
  )

log(`Review complete: ${allFindings.length} findings across ${REVIEW_DIMENSIONS.length} dimensions`)

// --- Phase 3: Adversarial Verification ---

phase('Verify')

if (allFindings.length === 0) {
  log('No findings to verify — proceeding to synthesis')
  return {
    summary: `Clean review across ${REVIEW_DIMENSIONS.length} dimensions. No issues found in ${diffInfo.changed_files.length} changed files.`,
    stats: { total_findings: 0, confirmed: 0, refuted: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 } },
    findings: [],
    ship_ready: true,
    recommendation: 'ship',
  }
}

// Pigeonhole early-exit: for P2/P3 findings, 3 votes suffice; for P0/P1, use 5 votes
const verifiedFindings = await pipeline(
  allFindings,
  async (finding) => {
    const votesNeeded = (finding.severity === 'P0' || finding.severity === 'P1') ? 5 : 3
    const confirmThreshold = Math.ceil(votesNeeded / 2) // majority

    const votes = await parallel(
      Array.from({ length: votesNeeded }, (_, i) => () =>
        agent(
          `You are an adversarial verifier. Your job is to REFUTE this finding if possible. Only confirm if you are confident it is a real issue.

Finding to verify:
- ID: ${finding.id}
- Title: ${finding.title}
- Severity: ${finding.severity}
- File: ${finding.file}${finding.line ? `:${finding.line}` : ''}
- Description: ${finding.description}
- Dimension: ${finding.dimension}

Steps:
1. Read the actual file and check the claim
2. Consider if the issue is real, the severity is appropriate, and the suggestion is actionable
3. Try to find reasons the finding might be wrong (false positive, intended behavior, already handled elsewhere)

Default to refuted=true if uncertain. Only confirm findings you can verify in the actual code.`,
          { label: `verify:${finding.id}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'haiku' }
        )
      )
    )

    const confirmed = votes.filter(Boolean).filter(v => v.confirmed).length
    const survives = confirmed >= confirmThreshold

    // Collect severity adjustments from confirmed voters
    const severityAdjustments = votes
      .filter(Boolean)
      .filter(v => v.confirmed && v.adjusted_severity)
      .map(v => v.adjusted_severity)

    const adjustedSeverity = severityAdjustments.length > 0
      ? severityAdjustments.sort()[0] // Take most severe consensus
      : finding.severity

    return {
      ...finding,
      verdict: survives ? 'confirmed' : 'refuted',
      votes: { confirmed, total: votes.filter(Boolean).length, threshold: confirmThreshold },
      severity: survives ? adjustedSeverity : finding.severity,
    }
  }
)

const confirmed = verifiedFindings.filter(f => f && f.verdict === 'confirmed')
const refuted = verifiedFindings.filter(f => f && f.verdict === 'refuted')

log(`Verification: ${confirmed.length} confirmed, ${refuted.length} refuted (out of ${allFindings.length} findings)`)

// --- Phase 4: Synthesis ---

phase('Synthesize')

const bySeverity = { P0: 0, P1: 0, P2: 0, P3: 0 }
confirmed.forEach(f => { bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1 })

const hasBlockers = bySeverity.P0 > 0 || bySeverity.P1 > 0

const synthesis = await agent(
  `You are a review synthesizer. Produce a final review report.

## Review Context
- ${diffInfo.changed_files.length} files changed (+${diffInfo.total_lines_added}/-${diffInfo.total_lines_removed})
- ${diffInfo.commits} commits
- ${REVIEW_DIMENSIONS.length} review dimensions: ${REVIEW_DIMENSIONS.map(d => d.key).join(', ')}
- ${allFindings.length} raw findings → ${confirmed.length} confirmed, ${refuted.length} refuted

## Confirmed Findings
${confirmed.map(f => `[${f.severity}] ${f.dimension.toUpperCase()} — ${f.title}
  File: ${f.file}${f.line ? ':' + f.line : ''}
  ${f.description}
  Suggestion: ${f.suggestion || 'N/A'}`).join('\n\n')}

${refuted.length > 0 ? `## Refuted Findings (for transparency)
${refuted.map(f => `[REFUTED] ${f.id}: ${f.title}`).join('\n')}` : ''}

## Your Task
Produce a synthesis with:
1. A 2-3 sentence overall summary
2. Stats breakdown
3. Ship readiness (no P0/P1 = ready)
4. Recommendation: "ship" | "fix-before-ship" | "needs-major-rework"

Be direct and actionable. Don't sugarcoat P0/P1 issues.`,
  { label: 'synthesis', phase: 'Synthesize', schema: SYNTHESIS_SCHEMA }
)

log(`Synthesis complete: ${synthesis?.recommendation || 'unknown'} recommendation, ${synthesis?.stats?.confirmed || 0} confirmed findings`)

return synthesis
