#!/usr/bin/env node
// category: user-facing
/**
 * branch-triage.mjs — Triage local git branches and worktrees into a decision list.
 *
 * The audit (§3.5 P2 #8) flagged branch/worktree pile-up (28 local branches, 8
 * worktrees) with no tooling to decide what to delete. This script inspects
 * every local branch and classifies it so a human can act in bulk:
 *
 *   - merged     : fully contained in main → safe to delete (`git branch -d`)
 *   - gone       : upstream deleted on remote → safe to delete
 *   - unmerged   : has commits not in main → KEEP, human decides
 *   - worktree   : checked out in a linked worktree → KEEP (prune separately)
 *   - current    : the active branch → KEEP
 *
 * It also runs `git worktree prune --dry-run` to surface stale worktree refs.
 *
 * Usage:
 *   node scripts/branch-triage.mjs                 # report only (no changes)
 *   node scripts/branch-triage.mjs --delete-merged # delete merged + gone branches
 *   node scripts/branch-triage.mjs --help
 *
 * --delete-merged only removes branches classified `merged` or `gone`. It never
 * touches `unmerged`, `worktree`, or the current branch. Each deletion is
 * printed; unmerged branches use `git branch -D` are NOT performed.
 */

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "Usage: node scripts/branch-triage.mjs [--delete-merged]",
      "",
      "Triage local branches into merged / gone / unmerged / worktree buckets.",
      "",
      "Options:",
      "  --delete-merged   Delete branches classified `merged` or `gone` only.",
      "                    Never deletes unmerged, worktree, or current branches.",
      "  --help            Show this help.",
      "",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

const deleteMerged = args.includes("--delete-merged");

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], ...opts })
    .toString()
    .trim();
}

const MAIN = "main";
const PROTECTED = new Set([MAIN]); // never delete the default branch
const currentBranch = git(["branch", "--show-current"]);
const worktreeBranches = new Set(
  git(["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((l) => l.startsWith("branch "))
    .map((l) => l.replace(/^branch\s+refs\/heads\//, "").replace(/^branch\s+/, "")),
);

// branch line format from git branch: optional "* " (current) or "+ " (worktree) prefix + name
const branchLines = git(["branch"]).split("\n").map((l) => l.trim()).filter(Boolean);
const branches = branchLines.map((l) => l.replace(/^[*+]\s+/, ""));

// git branch -vv lists each branch with upstream tracking incl. [gone] marker.
// Parse it once into a map: branch -> raw vv line (for gone detection).
const vvLines = git(["branch", "-vv"]).split("\n");
const vvByBranch = new Map();
for (const line of vvLines) {
  const name = line.trim().replace(/^[*+]\s+/, "").split(/\s+/)[0];
  if (name) vvByBranch.set(name, line);
}

// For each branch determine merged-into-main + upstream-gone status.
const rows = [];
for (const branch of branches) {
  const isCurrent = branch === currentBranch;
  const isWorktree = worktreeBranches.has(branch);
  let classification = "unmerged";
  let note = "";

  if (isCurrent) {
    classification = "current";
  } else if (PROTECTED.has(branch)) {
    classification = "current";
    note = "protected default branch";
  } else if (isWorktree) {
    classification = "worktree";
  } else {
    // merged into main?
    const ancestors = git(["branch", "--merged", MAIN]);
    const merged = ancestors
      .split("\n")
      .map((l) => l.trim().replace(/^[*+]\s+/, ""))
      .includes(branch);
    if (merged) {
      classification = "merged";
      note = "contained in main";
    } else {
      // upstream tracking status via branch -vv [gone] marker
      const vv = vvByBranch.get(branch) ?? "";
      if (vv.includes("[gone]")) {
        classification = "gone";
        note = "upstream deleted on remote";
      } else {
        classification = "unmerged";
        note = "has commits not in main";
      }
    }
  }

  rows.push({ branch, classification, note, isCurrent, isWorktree });
}

// ── Report ─────────────────────────────────────────────────────────────────
const buckets = { current: [], worktree: [], merged: [], gone: [], unmerged: [] };
for (const r of rows) buckets[r.classification].push(r);

const icon = { current: "★", worktree: "🔗", merged: "✓", gone: "✓", unmerged: "?" };
process.stdout.write("Branch triage\n");
process.stdout.write("==============\n\n");
for (const key of ["current", "worktree", "merged", "gone", "unmerged"]) {
  if (buckets[key].length === 0) continue;
  process.stdout.write(`${key} (${buckets[key].length}):\n`);
  for (const r of buckets[key]) {
    process.stdout.write(`  ${icon[key]} ${r.branch}${r.note ? " — " + r.note : ""}\n`);
  }
  process.stdout.write("\n");
}

process.stdout.write("Summary:\n");
process.stdout.write(`  total: ${rows.length}\n`);
process.stdout.write(`  safe-to-delete (merged + gone): ${buckets.merged.length + buckets.gone.length}\n`);
process.stdout.write(`  keep (current + worktree + unmerged): ${buckets.current.length + buckets.worktree.length + buckets.unmerged.length}\n\n`);

// ── Stale worktree prune preview ───────────────────────────────────────────
const stale = git(["worktree", "prune", "--dry-run"]);
if (stale) {
  process.stdout.write("Stale worktree refs (git worktree prune would remove):\n");
  process.stdout.write(stale.replace(/^/gm, "  ") + "\n\n");
}

// ── Delete ─────────────────────────────────────────────────────────────────
if (deleteMerged) {
  const toDelete = [...buckets.merged, ...buckets.gone];
  if (toDelete.length === 0) {
    process.stdout.write("No merged/gone branches to delete.\n");
    process.exit(0);
  }
  let deleted = 0;
  for (const r of toDelete) {
    try {
      git(["branch", "-d", r.branch]);
      process.stdout.write(`  deleted: ${r.branch}\n`);
      deleted++;
    } catch (err) {
      process.stderr.write(`  FAILED: ${r.branch} — ${err.message.split("\n")[0]}\n`);
    }
  }
  process.stdout.write(`\nDeleted ${deleted} branch(es).\n`);
} else if (buckets.merged.length + buckets.gone.length > 0) {
  process.stdout.write("Run with --delete-merged to remove the merged/gone branches.\n");
}

process.exit(0);
