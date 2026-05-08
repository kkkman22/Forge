/**
 * E2E helper — creates a temporary git repository for integration testing.
 *
 * Provides an isolated git repo with forge skeleton, cleaned up after each test.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempRepo {
  cwd: string;
  cleanup: () => void;
}

/**
 * Create a temporary git repo with a forge skeleton.
 * The repo is cleaned up automatically when `cleanup()` is called.
 */
export function createTempRepo(seed?: string): TempRepo {
  const cwd = mkdtempSync(join(tmpdir(), "forge-e2e-"));

  execFileSync("git", ["init"], { cwd, timeout: 5000 });
  execFileSync("git", ["config", "user.email", "e2e@forge.test"], { cwd });
  execFileSync("git", ["config", "user.name", "E2E"], { cwd });

  if (seed) {
    writeFileSync(join(cwd, "README.md"), seed);
  }

  // Create .forge directory structure
  mkdirSync(join(cwd, ".forge", "runs"), { recursive: true });
  mkdirSync(join(cwd, ".forge", "plans"), { recursive: true });
  mkdirSync(join(cwd, ".forge", "progress"), { recursive: true });

  writeFileSync(
    join(cwd, ".forge", "config.md"),
    ["---", "version: 1", "project_name: e2e-test", "---", ""].join("\n"),
  );

  // Create hooks directory with hooks.json
  mkdirSync(join(cwd, "hooks"), { recursive: true });
  writeFileSync(
    join(cwd, "hooks", "hooks.json"),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: "Write|Edit",
              hooks: [{ type: "command", command: "true" }],
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  execFileSync("git", ["add", "."], { cwd, timeout: 5000 });
  execFileSync("git", ["commit", "-m", "initial"], { cwd, timeout: 5000 });

  return {
    cwd,
    cleanup: () => {
      try {
        rmSync(cwd, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}

/**
 * Get the current HEAD commit SHA from a git repo.
 */
export function getHeadSha(cwd: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf-8",
    timeout: 5000,
  }).trim();
}

/**
 * Get the git log as an array of { sha, message } entries.
 */
export function getGitLog(cwd: string): Array<{ sha: string; message: string }> {
  const output = execFileSync("git", ["log", "--oneline", "--format=%H %s"], {
    cwd,
    encoding: "utf-8",
    timeout: 5000,
  }).trim();

  if (!output) return [];

  return output.split("\n").map((line) => {
    const spaceIdx = line.indexOf(" ");
    return {
      sha: line.slice(0, spaceIdx),
      message: line.slice(spaceIdx + 1),
    };
  });
}
