#!/usr/bin/env tsx
/**
 * Golden-fixture generator for the assembly snapshot tests.
 *
 * Drives the REAL forge-dispatcher pipeline against the REAL lib files and
 * extracts a structural fingerprint for every representative sub, writing
 * test/__fixtures__/assembly-golden.json.
 *
 * Re-run when a subcommand's structural contract (dispatch_mode, allowed_tools,
 * lib path) LEGITIMATELY changes:
 *   npx tsx scripts/gen-assembly-golden.mjs
 *
 * Do NOT re-run to silence a red snapshot caused by an accidental regression —
 * inspect the diff first.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { dispatchForgeSubcommand } from "../src/forge-dispatcher.js";
import { resolveAllowedTools } from "../src/forge-dispatcher/tools-resolve.js";
import { extractFingerprint } from "../src/forge-dispatcher/assemble-fingerprint.js";
import { wrapWorkspaceContext } from "../src/forge-dispatcher/untrusted-fence.js";
import { generateHints } from "../src/router.js";

const LIB_ROOT = resolve(process.cwd(), "skills/tinkerman/lib");

const REPRESENTATIVE_SUBS = [
  { sub: "build", taskType: "backend", phase: "greenfield" },
  { sub: "build", taskType: "docs", phase: "iteration" },
  { sub: "review", taskType: "fullstack", phase: "iteration" },
  { sub: "test", taskType: "backend", phase: "refactor" },
  { sub: "ship", taskType: "fullstack", phase: "greenfield" },
  { sub: "plan", taskType: "fullstack", phase: "greenfield" },
  { sub: "decide", taskType: "infra", phase: "greenfield" },
  { sub: "spec", taskType: "data", phase: "greenfield" },
  { sub: "learn", taskType: "docs", phase: "iteration" },
  { sub: "status", taskType: "frontend", phase: "bugfix" },
  { sub: "debug", taskType: "backend", phase: "bugfix" },
  { sub: "learn", taskType: "backend", phase: "refactor" },
];

const golden = {};
for (const { sub, taskType, phase } of REPRESENTATIVE_SUBS) {
  const result = await dispatchForgeSubcommand(sub, {
    _mocks: { agent: async () => undefined, read: () => undefined },
  });
  if (result.code !== "OK") throw new Error(`${sub} dispatch failed: ${result.code}`);

  const { resolveLibPath } = await import("../src/forge-dispatcher/path-resolve.js");
  const pathResult = resolveLibPath(sub);
  const libContent = readFileSync(pathResult.path, "utf-8");
  const fmMatch = libContent.match(/^---\n([\s\S]*?)\n---/);
  const modeMatch = fmMatch?.[1].match(/dispatch_mode:\s*([a-z]+)/);
  const dispatchMode = modeMatch?.[1] ?? "inline";
  const toolsResult = resolveAllowedTools(libContent);
  const allowedTools = toolsResult.ok ? toolsResult.tools : [];
  const contextBlock = wrapWorkspaceContext([
    { path: ".forge/status.md", content: "tier: standard\nphase: build" },
  ]);
  const hintTags = generateHints(taskType, phase, [sub]).map((h) => h.tag);

  golden[`${sub}|${taskType}|${phase}`] = extractFingerprint({
    subcommand: sub,
    dispatchMode,
    resolvedLibPath: pathResult.path.replace(LIB_ROOT, "tinkerman/lib").replace(/^\//, ""),
    allowedTools,
    contextBlock,
    hintTags,
  });
}

const outDir = resolve(process.cwd(), "test/__fixtures__");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, "assembly-golden.json"),
  JSON.stringify(golden, null, 2) + "\n",
);
console.error(`Wrote ${Object.keys(golden).length} fingerprints to test/__fixtures__/assembly-golden.json`);
