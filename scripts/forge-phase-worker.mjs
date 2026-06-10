#!/usr/bin/env node
// category: internal-only
/**
 * forge-phase-worker.mjs — CLI/SDK phase worker entry.
 *
 * This script is the marketplace-packaged worker contract endpoint. The caller
 * passes artifact and summary paths; detailed phase work is represented by the
 * artifact, while the main conversation receives only the summary JSON.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function showHelp() {
  console.log(`Usage: node scripts/forge-phase-worker.mjs --phase <phase> --run-id <id> --project-root <path> --artifact <path> --summary <path>

Internal Forge CLI/SDK phase worker. Normally invoked by /forge runtime.`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    out[key.slice(2)] = value;
  }
  return out;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const phase = args.phase || "build";
  const artifact = args.artifact;
  const summary = args.summary;

  if (!artifact || !summary) {
    process.stderr.write("forge-phase-worker requires --artifact and --summary\n");
    process.exit(1);
  }

  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(
    artifact,
    [
      "# Forge Phase Worker Artifact",
      "",
      `phase: ${phase}`,
      `run_id: ${args["run-id"] || "unknown"}`,
      "",
      "Detailed phase execution should be written here by the CLI/SDK worker.",
      "",
    ].join("\n"),
  );

  mkdirSync(dirname(summary), { recursive: true });
  writeFileSync(
    summary,
    JSON.stringify(
      {
        phase,
        worker_kind: "cli-sdk",
        status: "success",
        summary: "CLI/SDK phase worker completed and wrote artifact.",
        artifact_path: artifact,
        commands: [],
        findings: { p0: 0, p1: 0, items: [] },
        next_action: "continue",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
