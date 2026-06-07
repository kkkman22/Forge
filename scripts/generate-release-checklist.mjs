#!/usr/bin/env node
// category: internal-only
/**
 * Generate a machine-readable release evidence checklist.
 *
 * The artifact is uploaded by the tag publish workflow after the required
 * gates have run and before npm publish. It records commit identity, bundle
 * hashes, and the release commands whose evidence must be retained.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function parseOutputPath(argv) {
  const idx = argv.indexOf("--output");
  if (idx === -1) return resolve(ROOT, "release-checklist.json");
  const value = argv[idx + 1];
  if (!value) {
    console.error("--output requires a file path");
    process.exit(1);
  }
  return resolve(ROOT, value);
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf-8" }).trim();
}

function listTreeEntries(baseDir) {
  const entries = [];

  function walk(absPath) {
    const stat = statSync(absPath, { throwIfNoEntry: false });
    if (!stat) return;

    if (stat.isDirectory()) {
      const children = readdirSync(absPath).sort((a, b) => a.localeCompare(b));
      for (const child of children) walk(join(absPath, child));
      return;
    }

    entries.push(absPath);
  }

  walk(baseDir);
  return entries.sort((a, b) => relative(baseDir, a).localeCompare(relative(baseDir, b)));
}

function hashDirectory(relDir) {
  const dir = resolve(ROOT, relDir);
  if (!existsSync(dir)) throw new Error(`Release artifact directory missing: ${relDir}`);

  const hash = createHash("sha256");
  for (const file of listTreeEntries(dir)) {
    const relPath = relative(dir, file).replace(/\\/g, "/");
    const stat = statSync(file);
    hash.update(relPath);
    hash.update("\0");
    if (stat.isSymbolicLink()) {
      hash.update("symlink");
      hash.update("\0");
      hash.update(readlinkSync(file));
    } else {
      hash.update("file");
      hash.update("\0");
      hash.update(readFileSync(file));
    }
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function hashOptionalPack() {
  const packs = readdirSync(ROOT)
    .filter((name) => /^forge-loop-.*\.tgz$/.test(name))
    .sort((a, b) => a.localeCompare(b));
  const latest = packs.at(-1);
  if (!latest) return undefined;
  const hash = createHash("sha256");
  hash.update(readFileSync(resolve(ROOT, latest)));
  return `sha256:${hash.digest("hex")}`;
}

const gates = [
  { name: "full_check", command: "npm run check", required: true },
  { name: "coverage", command: "npm run test:coverage", required: true },
  {
    name: "security_audit",
    command: "npm audit --registry=https://registry.npmjs.org --audit-level=high",
    required: true,
  },
  { name: "e2e", command: "npm run test:e2e", required: true },
  { name: "dist_sync", command: "node scripts/check-dist-sync.mjs", required: true },
  { name: "bundle_sync", command: "node scripts/check-bundle-sync.mjs", required: true },
];

const outputPath = parseOutputPath(process.argv.slice(2));
const hashes = {
  dist: hashDirectory("dist"),
  dist_plugin: hashDirectory("dist-plugin"),
};
const npmPackHash = hashOptionalPack();
if (npmPackHash) hashes.npm_pack = npmPackHash;

const artifact = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  commit: git(["rev-parse", "HEAD"]),
  source_branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  hashes,
  gates,
  artifacts: {
    npm_pack_dry_run: "npm pack --dry-run",
    plugin_validate: "claude plugin validate .",
    npm_pack_install_smoke: "npm pack --dry-run && npm install <generated tarball>",
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`release checklist written: ${relative(ROOT, outputPath)}`);
