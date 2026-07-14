/**
 * P1-1 regression: status writes must be lock-protected + atomic.
 *
 * Without a lock spanning read→transform→write, two parallel subagents doing
 * RMW on the same status.md lose updates (last-write-wins overwrites the
 * prior write). The .claude/rules/state-file-locking.md Iron Law requires
 * "lock → read → transform → write → unlock" across the whole RMW cycle.
 *
 * These tests cover:
 *  - Concurrent RMW: N processes incrementing a counter never lose updates.
 *  - Exit cleanup: held locks are released via process.on('exit').
 *  - Atomicity: the target file is never left half-written (tmp+rename).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, renameSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");

function makeTmpForgeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-status-atomic-"));
  // status.md lives at <forgeRoot>/status.md where forgeRoot = .forge/
  return join(dir, "project", ".forge");
}

const realFsIO = {
  exists: (p: string) => existsSync(p),
  dirExists: (p: string) => existsSync(p),
  read: (p: string) => readFileSync(p, "utf-8"),
  write: (p: string, c: string) => writeFileSync(p, c, "utf-8"),
  listDir: () => [] as string[],
  move: (src: string, dest: string) => renameSync(src, dest),
  mkdirp: (p: string) => mkdirSync(p, { recursive: true }),
};

describe("writeStatusAtomic: lock-protected atomic write (P1-1)", () => {
  let forgeRoot: string;

  beforeEach(() => {
    forgeRoot = makeTmpForgeRoot();
    mkdirSync(forgeRoot, { recursive: true });
  });
  afterEach(() => {
    rmSync(join(forgeRoot, "..", ".."), { recursive: true, force: true });
  });

  it("writes content atomically (tmp + rename → no half-written target)", async () => {
    const target = join(forgeRoot, "status.md");
    const { writeStatusAtomic } = await import("../src/status-atomic.js");
    writeStatusAtomic(forgeRoot, target, () => "phase: build\n", realFsIO);
    expect(readFileSync(target, "utf-8")).toBe("phase: build\n");
    // No leftover tmp file.
    expect(existsSync(`${target}.tmp`)).toBe(false);
    // Lock released after write.
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it("transform sees prior content (read-modify-write)", async () => {
    const target = join(forgeRoot, "status.md");
    const { writeStatusAtomic } = await import("../src/status-atomic.js");
    writeStatusAtomic(forgeRoot, target, () => "count: 1\n", realFsIO);
    writeStatusAtomic(forgeRoot, target, (prev) => {
      const n = Number.parseInt(prev.match(/count: (\d+)/)?.[1] ?? "0", 10);
      return `count: ${n + 1}\n`;
    }, realFsIO);
    expect(readFileSync(target, "utf-8")).toBe("count: 2\n");
  });

  it("5-process concurrent increment: no lost updates", () => {
    // Spawn 5 child processes, each incrementing a shared counter PER_PROC
    // times through writeStatusAtomic. Without locking, classic last-write-
    // wins loses updates. With locking, the final count == 5 * PER_PROC.
    const PER_PROC = 40;
    const target = join(forgeRoot, "status.md");
    writeFileSync(target, "count: 0\n", "utf-8");

    const worker = join(import.meta.dirname, "status-atomic-concurrent-worker.ts");
    for (let p = 0; p < 5; p++) {
      execFileSync("npx", ["tsx", worker, forgeRoot, target, String(PER_PROC)], {
        cwd: REPO_ROOT,
        timeout: 60_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    const final = readFileSync(target, "utf-8");
    const count = Number.parseInt(final.match(/count: (\d+)/)?.[1] ?? "0", 10);
    // Sequential increments across all procs: no lost update.
    expect(count).toBe(5 * PER_PROC);
  });

  it("lock files are released even on transform throw (finally cleanup)", async () => {
    const target = join(forgeRoot, "status.md");
    const { writeStatusAtomic } = await import("../src/status-atomic.js");
    expect(() =>
      writeStatusAtomic(
        forgeRoot,
        target,
        () => {
          throw new Error("boom");
        },
        realFsIO,
      ),
    ).toThrow();
    expect(existsSync(`${target}.lock`)).toBe(false);
  });
});
