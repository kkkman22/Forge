#!/usr/bin/env node
// category: user-facing
/**
 * run-checks.mjs — Parallel grouping runner for the `npm run check` gate.
 *
 * Replaces the serial 27-step `&&` chain in package.json `scripts.check`. The
 * audit (§3.4 P2) flagged that chain: one failing step aborts the rest, so
 * later failures stay invisible, and the wall-clock is the sum of all steps.
 *
 * This runner splits the checks into four independent groups and runs the
 * GROUPS in parallel (each group runs its steps serially internally). All
 * groups always run to completion; failures are aggregated into one report.
 * Exit code is non-zero iff any group had a failing step — preserving the
 * gate semantics of the original chain.
 *
 * Grouping rationale:
 *   - static:  type/lint/structure checks (tsc, biome, registry, api, skills…)
 *   - tests:   vitest run (the long pole; isolated so it never blocks static)
 *   - doc:     markdown / docs-governance checks (readme metrics, links, docs:check)
 *   - bundle:  build-artifact checks (dist-sync, mcp bundle freshness)
 *
 * Usage:
 *   node scripts/run-checks.mjs            # run all groups in parallel
 *   node scripts/run-checks.mjs --group tests   # run one group only
 *   node scripts/run-checks.mjs --serial   # run groups serially (debug)
 *   node scripts/run-checks.mjs --help
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "Usage: node scripts/run-checks.mjs [--group <name>] [--serial]",
      "",
      "Run the Forge check gate as four parallel groups (static / tests / doc /",
      "bundle). Aggregates failures; exits non-zero if any step fails.",
      "",
      "Options:",
      "  --group <name>   Run only one group (static|tests|doc|bundle).",
      "  --serial         Run groups one after another instead of in parallel.",
      "  --help           Show this help.",
      "",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

const serialMode = args.includes("--serial");
let onlyGroup = null;
const groupIdx = args.indexOf("--group");
if (groupIdx !== -1 && args[groupIdx + 1]) onlyGroup = args[groupIdx + 1];

// ── Group definitions (step lists run serially within each group) ──────────
// Each step is [cmd, args[]]. Env prefixes are baked into the env of the step.
const GROUPS = {
  static: {
    label: "static-checks",
    steps: [
      ["npx", ["tsc", "--noEmit"]],
      ["npx", ["biome", "check", "src/", "test/"]],
      ["node", ["scripts/sync-command-registry.mjs", "--check"]],
      ["node", ["scripts/check-public-api.mjs"]],
      ["node", ["scripts/check-domain-safety.mjs"]],
      ["bash", ["scripts/check-skill-function-refs.sh", "--strict"]],
      ["bash", ["scripts/validate-skill-descriptions.sh"]],
      ["bash", ["scripts/validate-skill-length.sh"]],
      ["bash", ["scripts/validate-skill-skeleton.sh"]],
      ["bash", ["scripts/check-evolution-marker-zones.sh"]],
      ["node", ["scripts/validate-scripts-help.mjs"]],
      ["node", ["scripts/check-shell-pipefail.mjs"]],
      ["node", ["scripts/lint-evolved-rules.mjs"]],
      ["node", ["scripts/verify-evolved-rule-infra-refs.mjs"]],
      ["node", ["scripts/normalize-hook-paths.mjs", "--check"]],
      ["node", ["scripts/lint-agents.mjs"]],
      ["node", ["scripts/check-agent-originality.mjs"]],
      ["node", ["scripts/check-agent-links.mjs"]],
      ["node", ["scripts/check-unused-module.mjs"]],
      ["node", ["scripts/check-circular-deps.mjs"]],
    ],
  },
  tests: {
    label: "tests",
    steps: [["npx", ["vitest", "run"]]],
  },
  doc: {
    label: "doc-checks",
    steps: [
      ["bash", ["scripts/check-readme-metrics.sh"]],
      ["bash", ["scripts/check-doc-links.sh"]],
      ["bash", ["scripts/check-doc-structure.sh"]],
      ["npm", ["run", "docs:check"]],
    ],
  },
  bundle: {
    label: "bundle-checks",
    steps: [
      // dist-sync reuses the typecheck already done in the static group.
      ["node", ["scripts/check-dist-sync.mjs"], { env: { FORGE_DIST_SYNC_SKIP_TYPECHECK: "1" } }],
      ["node", ["scripts/bundle-mcp.mjs", "--check"]],
    ],
  },
};

// ── Runner ─────────────────────────────────────────────────────────────────

/** Run one step; resolves { cmd, ok, durationMs, output }. */
function runStep(cmd, stepArgs, stepEnv) {
  const start = Date.now();
  return new Promise((res) => {
    const child = spawn(cmd, stepArgs, {
      cwd: ROOT,
      env: { ...process.env, ...stepEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (err) => {
      res({ ok: false, durationMs: Date.now() - start, output: String(err) });
    });
    child.on("close", (code) => {
      const output = (stdout + stderr).trim();
      res({ ok: code === 0, durationMs: Date.now() - start, output });
    });
  });
}

/** Run a group's steps serially; returns { label, results[], ok, durationMs }. */
async function runGroup(group) {
  const groupStart = Date.now();
  const results = [];
  for (const step of group.steps) {
    const [cmd, stepArgs, stepEnv] = step;
    const display = `${cmd} ${stepArgs.join(" ")}`.trim();
    const result = await runStep(cmd, stepArgs, stepEnv);
    results.push({ cmd: display, ...result });
    if (!result.ok) break; // stop the group at first failure (serial semantics)
  }
  return {
    label: group.label,
    results,
    ok: results.length > 0 && results.every((r) => r.ok),
    durationMs: Date.now() - groupStart,
  };
}

const selectedGroups = onlyGroup
  ? { [onlyGroup]: GROUPS[onlyGroup] }
  : GROUPS;

if (onlyGroup && !GROUPS[onlyGroup]) {
  process.stderr.write(
    `ERROR: unknown group "${onlyGroup}". Choose from ${Object.keys(GROUPS).join(", ")}.\n`,
  );
  process.exit(1);
}

const groupEntries = Object.values(selectedGroups);

process.stdout.write(
  `▶ Running ${groupEntries.length} group(s) ${serialMode ? "serially" : "in parallel"}: ` +
    `${groupEntries.map((g) => g.label).join(", ")}\n\n`,
);

const groupResults = serialMode
  ? []
  : await Promise.all(groupEntries.map(runGroup));
if (serialMode) {
  for (const group of groupEntries) groupResults.push(await runGroup(group));
}

// ── Aggregate report ───────────────────────────────────────────────────────
let totalFail = 0;
for (const gr of groupResults) {
  const status = gr.ok ? "✓" : "✗";
  process.stdout.write(`${status} ${gr.label} (${(gr.durationMs / 1000).toFixed(1)}s)\n`);
  for (const r of gr.results) {
    const mark = r.ok ? "  ✓" : "  ✗";
    process.stdout.write(`${mark} ${r.cmd} (${(r.durationMs / 1000).toFixed(1)}s)\n`);
    if (!r.ok && r.output) {
      const tail = r.output.split("\n").slice(-15).join("\n");
      process.stdout.write(`      └─ last output:\n${tail.replace(/^/gm, "        ")}\n`);
    }
    if (!r.ok) totalFail++;
  }
}

const totalOk = groupResults.every((g) => g.ok);
process.stdout.write(
  `\n${totalOk ? "✅ All checks passed." : `🚫 ${totalFail} step(s) failed.`}\n`,
);
process.exit(totalOk ? 0 : 1);
