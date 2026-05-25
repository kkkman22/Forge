/**
 * Forge multi-agent review workflow — invoked from /forge review (interactive mode L0).
 *
 * Spawns three specialised review subagents in parallel:
 *   - spec-check: layer 1 (requirement coverage, scope creep)
 *   - quality-check: layer 2 (naming, errors, performance, tests)
 *   - security-check: layer 3 (secrets, injection, deps, perms)
 *
 * Concurrency is bounded via workflows/lib/concurrency.js (T2) so the workflow
 * runtime never exceeds FORGE_MAX_PARALLEL_AGENTS_RUNTIME (or its fallbacks).
 *
 * Contract: this file is loaded by the Claude Code Workflow runtime (`bp()`).
 * Forge's L1 fallback path (Agent tool) covers any environment where this
 * workflow is unavailable — see .claude/rules/workflow-fallback-ladder.md.
 */

const meta = {
  name: "multi-agent-review",
  version: "1.0.0",
  description: "Three-layer parallel review: spec-check, quality-check, security-check",
  inputs: {
    diffSummary: { type: "string", required: false },
    changedFiles: { type: "array", items: { type: "string" }, required: false },
  },
  outputs: {
    findings: { type: "array" },
    severityCounts: { type: "object" },
    layersCompleted: { type: "array" },
  },
};

async function run(bp, ctx = {}) {
  const { phase, agent, log, return: ret } = bp;
  const { chunkedParallel } = require("./lib/concurrency.js");

  const reviewers = [
    { id: "spec-check", subagent: "spec-check", layer: 1 },
    { id: "quality-check", subagent: "quality-check", layer: 2 },
    { id: "security-check", subagent: "security-check", layer: 3 },
  ];

  const findings = [];
  const layersCompleted = [];

  await phase("review-layers", async () => {
    const results = await chunkedParallel(reviewers, async (reviewer) => {
      log(`▶️ Layer ${reviewer.layer}: ${reviewer.id}`);
      const result = await agent(reviewer.subagent, {
        prompt: ctx.diffSummary ?? "",
        changedFiles: ctx.changedFiles ?? [],
      });
      layersCompleted.push(reviewer.layer);
      return result?.findings ?? [];
    });
    for (const layerFindings of results) {
      findings.push(...layerFindings);
    }
  });

  const severityCounts = findings.reduce(
    (acc, f) => {
      const sev = f.severity ?? "P3";
      acc[sev] = (acc[sev] ?? 0) + 1;
      return acc;
    },
    { P0: 0, P1: 0, P2: 0, P3: 0 },
  );

  return ret({ findings, severityCounts, layersCompleted });
}

module.exports = { meta, run };
