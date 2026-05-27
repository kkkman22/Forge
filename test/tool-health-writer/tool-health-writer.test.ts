/**
 * F8 / R12.7 — `tool-health.md` writer tests.
 *
 * Coverage:
 *  - line format matches R12.6 spec (`<ts> · <subcommand> · <event> · <details>`)
 *  - single-process append-only invariant: prefix is preserved
 *  - lock acquired/released around write (lock file gone after success)
 *  - lock timeout when peer holds the lock past `timeoutMs`
 *  - stale lock recovery: lock older than `staleLockMs` is force-removed
 *  - 5-process true concurrent append safety (R12.7): 5 child node processes
 *    each write 4 records → final file has 20 distinct, complete lines, no
 *    interleaving, every prefix-step satisfies `next.startsWith(prev)`
 */

import { execFile, execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendToolHealthRecord,
  formatToolHealthLine,
  ToolHealthLockTimeoutError,
} from "../../src/tool-health-writer.js";

const execFileAsync = promisify(execFile);

let tmpRoot: string;
let healthPath: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "tool-health-"));
  healthPath = join(tmpRoot, ".forge", "knowledge", "tool-health.md");
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("ToolHealthWriter: line format (R12.6)", () => {
  it("formats record as `<ts> · <subcommand> · <event> · <details>` with trailing newline", () => {
    const line = formatToolHealthLine({
      timestamp: "2026-05-25T00:00:00.000Z",
      subcommand: "review",
      event: "429-degrade",
      details: "old=6 new=3 probe=a",
    });
    expect(line).toBe("2026-05-25T00:00:00.000Z · review · 429-degrade · old=6 new=3 probe=a\n");
  });

  it("defaults timestamp to now() when omitted", () => {
    const before = Date.now();
    const line = formatToolHealthLine({
      subcommand: "decide",
      event: "incompatible",
      details: "model=foo",
    });
    const m = line.match(/^([^ ]+) · /);
    expect(m).toBeTruthy();
    const ts = Date.parse(m![1]!);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now() + 1_000);
  });
});

describe("ToolHealthWriter: single append correctness", () => {
  it("creates parent dirs and appends a single line", () => {
    appendToolHealthRecord(healthPath, {
      timestamp: "2026-05-25T00:00:00.000Z",
      subcommand: "review",
      event: "restored",
      details: "old=3 new=6",
    });
    expect(existsSync(healthPath)).toBe(true);
    const content = readFileSync(healthPath, "utf-8");
    expect(content).toBe("2026-05-25T00:00:00.000Z · review · restored · old=3 new=6\n");
  });

  it("preserves prefix invariant across sequential appends", () => {
    const line1 = appendToolHealthRecord(healthPath, {
      timestamp: "2026-05-25T00:00:00.000Z",
      subcommand: "review",
      event: "429-degrade",
      details: "old=6 new=3 probe=a",
    });
    const after1 = readFileSync(healthPath, "utf-8");
    expect(after1).toBe(line1);

    const line2 = appendToolHealthRecord(healthPath, {
      timestamp: "2026-05-25T00:00:01.000Z",
      subcommand: "review",
      event: "429-degrade",
      details: "old=3 new=2 probe=b",
    });
    const after2 = readFileSync(healthPath, "utf-8");
    // Prefix invariant: previous content must remain a strict prefix.
    expect(after2.startsWith(after1)).toBe(true);
    expect(after2).toBe(line1 + line2);
  });

  it("removes the .lock file after a successful write", () => {
    appendToolHealthRecord(healthPath, {
      subcommand: "loop",
      event: "restored",
      details: "x=1",
    });
    expect(existsSync(`${healthPath}.lock`)).toBe(false);
  });
});

describe("ToolHealthWriter: lock contention", () => {
  it("times out when peer holds the lock past timeoutMs", () => {
    // Pre-create the lock file to simulate a peer holding it.
    execFileSync("mkdir", ["-p", join(tmpRoot, ".forge", "knowledge")]);
    const lockPath = `${healthPath}.lock`;
    const fd = openSync(lockPath, "w");
    closeSync(fd);

    const t0 = Date.now();
    expect(() =>
      appendToolHealthRecord(
        healthPath,
        {
          subcommand: "review",
          event: "429-degrade",
          details: "x=1",
        },
        { timeoutMs: 80, sleepBaseMs: 5, staleLockMs: 60_000 },
      ),
    ).toThrow(ToolHealthLockTimeoutError);
    const waited = Date.now() - t0;
    expect(waited).toBeGreaterThanOrEqual(70);

    rmSync(lockPath, { force: true });
  });

  it("force-removes stale lock older than staleLockMs and proceeds", () => {
    execFileSync("mkdir", ["-p", join(tmpRoot, ".forge", "knowledge")]);
    const lockPath = `${healthPath}.lock`;
    writeFileSync(lockPath, "");
    // Backdate the lock so it looks abandoned.
    const past = Math.floor(Date.now() / 1000) - 120;
    utimesSync(lockPath, past, past);

    appendToolHealthRecord(
      healthPath,
      {
        timestamp: "2026-05-25T00:00:00.000Z",
        subcommand: "review",
        event: "restored",
        details: "old=2 new=6",
      },
      { timeoutMs: 1_000, staleLockMs: 30_000 },
    );

    const content = readFileSync(healthPath, "utf-8");
    expect(content).toBe("2026-05-25T00:00:00.000Z · review · restored · old=2 new=6\n");
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe("ToolHealthWriter: 5-process concurrent append safety (R12.7)", () => {
  it("5 child processes × 4 records each → 20 complete distinct lines, no interleaving, prefix-monotone", async () => {
    const workerPath = join(__dirname, "concurrent-append-worker.ts");
    const PROCS = 5;
    const PER_PROC = 4;

    // --experimental-strip-types is only available on Node 22+.
    // On older versions, fall back to npx tsx.
    const nodeMajor = Number.parseInt(process.version.slice(1).split(".")[0], 10);
    const spawnWorker = (workerArgs: string[]): Promise<{ stdout: string; stderr: string }> => {
      if (nodeMajor >= 22) {
        return execFileAsync(
          process.execPath,
          [
            "--experimental-strip-types",
            "--no-warnings=ExperimentalWarning",
            workerPath,
            ...workerArgs,
          ],
          { timeout: 30_000 },
        );
      }
      return execFileAsync("npx", ["tsx", workerPath, ...workerArgs], { timeout: 30_000 });
    };

    const tasks: Array<Promise<{ stdout: string; stderr: string }>> = [];
    for (let p = 0; p < PROCS; p++) {
      const workerArgs = [healthPath, "review", "429-degrade", `proc${p}`, String(PER_PROC)];
      tasks.push(spawnWorker(workerArgs));
    }
    await Promise.all(tasks);

    const content = readFileSync(healthPath, "utf-8");
    const lines = content.split("\n");
    // Final char is "\n", so split produces a trailing empty element.
    expect(lines[lines.length - 1]).toBe("");
    const records = lines.slice(0, -1);

    expect(records).toHaveLength(PROCS * PER_PROC);

    // Every line conforms to the R12.6 schema and is fully formed (no torn writes).
    const SCHEMA = /^[^ ]+ · review · 429-degrade · proc[0-4]#[0-3]$/;
    for (const r of records) {
      expect(r).toMatch(SCHEMA);
    }

    // Distinct (no duplicates, no partial repeats).
    expect(new Set(records).size).toBe(PROCS * PER_PROC);

    // All 20 expected `proc{p}#{i}` markers present exactly once.
    const expected = new Set<string>();
    for (let p = 0; p < PROCS; p++) {
      for (let i = 0; i < PER_PROC; i++) expected.add(`proc${p}#${i}`);
    }
    const seen = new Set(records.map((r) => r.split(" · ")[3]));
    expect(seen).toEqual(expected);
  }, 30_000);
});
