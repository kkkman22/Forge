/**
 * Integration tests for baseline-resolver 4-level fallback chain.
 *
 * Covers [R1.10]:
 *   - Explicit --baseline flag resolved via git rev-parse
 *   - merge-base(origin/main) when remote exists
 *   - HEAD^ fallback when no remote
 *   - Last treatment snapshot when no git context
 *   - All fail → { strategy: "none" }
 *
 * **Validates: Requirements R1.10**
 */

import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveBaseline } from "../src/baseline-resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

function makeTmp(name: string): string {
  testDir = join(tmpdir(), `forge-baseline-test-${name}-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function gitInit(dir: string): void {
  execSync("git init", { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  writeFileSync(join(dir, "a.txt"), "initial");
  execSync("git add .", { cwd: dir });
  execSync('git commit -m "initial"', { cwd: dir });
}

function gitCommit(dir: string, file: string, content: string, msg: string): void {
  writeFileSync(join(dir, file), content);
  execSync(`git add ${file}`, { cwd: dir });
  execSync(`git commit -m "${msg}"`, { cwd: dir });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveBaseline [R1.10]", () => {
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("Level 1: explicit --baseline flag resolves via git rev-parse", async () => {
    const dir = makeTmp("explicit");
    gitInit(dir);
    const sha = execSync("git rev-parse HEAD", { cwd: dir }).toString().trim();

    const result = await resolveBaseline("test-topic", sha, { cwd: dir });
    expect(result.strategy).toBe("explicit");
    expect(result.ref).toBe(sha);
  });

  it("Level 2: merge-base(origin/main) when remote exists", async () => {
    // Create a "remote" repo and a clone
    const remoteDir = join(tmpdir(), `forge-baseline-remote-${Date.now()}`);
    mkdirSync(remoteDir, { recursive: true });
    execSync("git init -b main", { cwd: remoteDir });
    execSync('git config user.email "test@test.com"', { cwd: remoteDir });
    execSync('git config user.name "Test"', { cwd: remoteDir });
    writeFileSync(join(remoteDir, "a.txt"), "initial");
    execSync("git add .", { cwd: remoteDir });
    execSync('git commit -m "initial"', { cwd: remoteDir });

    // Clone it
    const dir = makeTmp("mergebase");
    execSync(`git clone ${remoteDir} .`, { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });

    // Make a commit on top
    writeFileSync(join(dir, "b.txt"), "local change");
    execSync("git add .", { cwd: dir });
    execSync('git commit -m "local"', { cwd: dir });

    const result = await resolveBaseline("test-topic", undefined, { cwd: dir });
    expect(result.strategy).toBe("merge-base");
    expect(result.ref).toBeTruthy();

    rmSync(remoteDir, { recursive: true, force: true });
  });

  it("Level 3: HEAD^ fallback when no remote", async () => {
    const dir = makeTmp("parent");
    gitInit(dir);

    // Add second commit so HEAD^ exists
    gitCommit(dir, "c.txt", "second commit content", "second");

    const parentSha = execSync("git rev-parse HEAD^", { cwd: dir }).toString().trim();

    const result = await resolveBaseline("test-topic", undefined, { cwd: dir });
    expect(result.strategy).toBe("parent");
    expect(result.ref).toBe(parentSha);
  });

  it("Level 4: last treatment snapshot when no git context", async () => {
    const dir = makeTmp("no-git");
    // No git init — simulate no git context

    // Create a fake treatment snapshot
    const findingsDir = join(
      dir,
      ".tinkerman",
      "findings",
      "test-topic",
      "verify-this",
      "treatment",
    );
    mkdirSync(findingsDir, { recursive: true });
    writeFileSync(join(findingsDir, "bench.json"), "{}");

    const result = await resolveBaseline("test-topic", undefined, {
      cwd: dir,
      forgeDir: join(dir, ".tinkerman"),
    });
    expect(result.strategy).toBe("last-treatment");
    expect(result.snapshotDir).toBeTruthy();
  });

  it("All fail → strategy none", async () => {
    const dir = makeTmp("all-fail");
    // No git, no snapshots
    const result = await resolveBaseline("test-topic", undefined, {
      cwd: dir,
      forgeDir: join(dir, ".tinkerman"),
    });
    expect(result.strategy).toBe("none");
    expect(result.ref).toBeNull();
  });

  it("explicit invalid ref falls through to next level", async () => {
    const dir = makeTmp("invalid-ref");
    gitInit(dir);
    gitCommit(dir, "d.txt", "content", "second");

    const result = await resolveBaseline("test-topic", "nonexistent-ref-xyz", { cwd: dir });
    // Should fall through to "parent" strategy since there's no remote
    expect(result.strategy).toBe("parent");
    expect(result.ref).toBeTruthy();
  });
});
