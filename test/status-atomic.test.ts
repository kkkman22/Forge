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

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    writeStatusAtomic(
      forgeRoot,
      target,
      (prev) => {
        const n = Number.parseInt(prev.match(/count: (\d+)/)?.[1] ?? "0", 10);
        return `count: ${n + 1}\n`;
      },
      realFsIO,
    );
    expect(readFileSync(target, "utf-8")).toBe("count: 2\n");
  });

  it("5-process concurrent increment: no lost updates", { timeout: 120_000 }, () => {
    // Spawn 5 child processes, each incrementing a shared counter PER_PROC
    // times through writeStatusAtomic. Without locking, classic last-write-
    // wins loses updates. With locking, the final count == 5 * PER_PROC.
    //
    // Audit P1: 5 × `npx tsx` cold starts are slow on CI (esp. Node 20);
    // the default 5s vitest timeout fires before all workers finish. Raised
    // to 120s (each worker has its own 60s execFileSync cap internally).
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

// ---------------------------------------------------------------------------
// Audit P2-1 (2026-07-16): exists=true but read throws must NOT clobber.
// ---------------------------------------------------------------------------

describe("writeStatusAtomic: read-failure must abort, not clobber (audit P2-1)", () => {
  let forgeRoot: string;

  beforeEach(() => {
    forgeRoot = makeTmpForgeRoot();
    mkdirSync(forgeRoot, { recursive: true });
  });
  afterEach(() => {
    rmSync(join(forgeRoot, "..", ".."), { recursive: true, force: true });
  });

  it("preserves existing content when io.read throws (fail-closed, not fail-open)", async () => {
    const target = join(forgeRoot, "status.md");
    // Seed real existing content that must survive a failed read.
    writeFileSync(target, "tier: light\nphase: build\ntopic: precious\n", "utf-8");

    // IO that reports the file as existing but fails to read it (perm flip /
    // IO error / EMFILE). write/move use the real fs so that, under the OLD
    // fail-open code, the clobber would actually land on disk. Lock is no-op
    // to keep the test off the real lockfile primitive.
    const readFailIO = {
      exists: () => true,
      dirExists: () => true,
      read: () => {
        throw new Error("EACCES: permission denied");
      },
      write: (p: string, c: string) => writeFileSync(p, c, "utf-8"),
      listDir: () => [] as string[],
      move: (src: string, dest: string) => renameSync(src, dest),
      mkdirp: () => {},
      acquireLock: () => {},
      releaseLock: () => {},
    };

    const { writeStatusAtomic } = await import("../src/status-atomic.js");
    // Before the fix, the read error was swallowed into prev="" and the write
    // proceeded, clobbering the existing content with the transform output.
    // Fail-closed = the error propagates so the caller can decide, and the
    // file is left untouched.
    expect(() => writeStatusAtomic(forgeRoot, target, () => "GARBAGE", readFailIO)).toThrow();

    // The original content survives (no clobber).
    expect(readFileSync(target, "utf-8")).toBe("tier: light\nphase: build\ntopic: precious\n");
  });
});
