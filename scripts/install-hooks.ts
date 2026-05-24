#!/usr/bin/env node
/**
 * Postinstall hook installer — configures git to use .githooks/ directory.
 * Skips in CI environments. No-op if already configured.
 */
import { existsSync, chmodSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const GITHOOKS_DIR = ".githooks";
const PRE_COMMIT_HOOK = resolve(GITHOOKS_DIR, "pre-commit");

function isGitRepo(): boolean {
  try {
    execSync("git rev-parse --git-dir", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getCurrentHooksPath(): string | undefined {
  try {
    return execSync("git config core.hooksPath", { encoding: "utf-8" }).trim();
  } catch {
    return undefined;
  }
}

function ensureExecutable(filePath: string): void {
  if (!existsSync(filePath)) return;
  const stat = statSync(filePath);
  if (!(stat.mode & 0o111)) {
    chmodSync(filePath, stat.mode | 0o111);
  }
}

function main(): void {
  if (process.env.CI === "true") {
    process.stdout.write("Skipping hook installation in CI environment.\n");
    return;
  }

  if (!isGitRepo()) {
    process.stdout.write("Not a git repository, skipping hook installation.\n");
    return;
  }

  if (!existsSync(GITHOOKS_DIR)) {
    process.stdout.write(`No ${GITHOOKS_DIR}/ directory found, skipping.\n`);
    return;
  }

  const currentPath = getCurrentHooksPath();
  if (currentPath === GITHOOKS_DIR) {
    process.stdout.write("Git hooks already configured.\n");
    return;
  }

  if (!existsSync(PRE_COMMIT_HOOK)) {
    process.stdout.write("No pre-commit hook found in .githooks/, skipping.\n");
    return;
  }

  ensureExecutable(PRE_COMMIT_HOOK);
  execSync(`git config core.hooksPath ${GITHOOKS_DIR}`);
  process.stdout.write(`Installed git hooks from ${GITHOOKS_DIR}/.\n`);
}

main();
