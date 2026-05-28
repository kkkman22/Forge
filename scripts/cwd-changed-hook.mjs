#!/usr/bin/env node
// cwd-changed-hook.mjs — CwdChanged hook for dangerous branch detection (R16)
//
// Reads JSON input from stdin (Claude Code hook protocol).
// Detects when user is on a dangerous branch (main, master, release-*)
// and outputs a systemMessage warning. Never blocks — always exits 0.
//
// Input: { session_id, cwd, hook_event_name: "CwdChanged", old_cwd, new_cwd }
// Output: { systemMessage: "..." } or nothing (exit 0 silently)

import { execFileSync } from "node:child_process";

// Dangerous branch patterns
const DANGEROUS_BRANCHES = ["main", "master"];
const RELEASE_PREFIX = "release-";

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

function getCurrentBranch(cwd) {
  try {
    const result = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch {
    return null;
  }
}

function isDangerousBranch(branch) {
  if (!branch) return false;
  if (DANGEROUS_BRANCHES.includes(branch)) return true;
  if (branch.startsWith(RELEASE_PREFIX)) return true;
  return false;
}

async function main() {
  let input;
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      process.exit(0);
    }
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const cwd = input.new_cwd || input.cwd;
  if (!cwd) {
    process.exit(0);
  }

  const branch = getCurrentBranch(cwd);
  if (!branch) {
    // Not a git repo or git command failed — silent exit
    process.exit(0);
  }

  if (isDangerousBranch(branch)) {
    const output = {
      systemMessage: `当前在 ${branch} 分支，建议切换到 feature/ 分支`,
    };
    process.stdout.write(JSON.stringify(output));
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
