/**
 * P1-1 concurrent-append worker: spawned by test/status-atomic.test.ts.
 * Increments a shared counter N times through writeStatusAtomic against a
 * real fs tmpdir. If locking is absent/incorrect, the parent test sees a
 * final count < 5*N (lost updates).
 *
 * Args: <forgeRoot> <targetPath> <incrementCount>
 */
import { writeStatusAtomic } from "../src/status-atomic.js";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";

const [, , forgeRootArg, targetArg, countArg] = process.argv;
if (!forgeRootArg || !targetArg || !countArg) {
  console.error("usage: tsx status-atomic-concurrent-worker.ts <forgeRoot> <target> <count>");
  process.exit(2);
}
const forgeRoot = forgeRootArg;
const target = targetArg;
const N = Number.parseInt(countArg, 10);

const realFsIO = {
  exists: (p: string) => existsSync(p),
  dirExists: (p: string) => existsSync(p),
  read: (p: string) => readFileSync(p, "utf-8"),
  write: (p: string, c: string) => writeFileSync(p, c, "utf-8"),
  listDir: () => [] as string[],
  move: (src: string, dest: string) => renameSync(src, dest),
  mkdirp: (p: string) => mkdirSync(p, { recursive: true }),
};

for (let i = 0; i < N; i++) {
  writeStatusAtomic(
    forgeRoot,
    target,
    (prev) => {
      const n = Number.parseInt(prev.match(/count: (\d+)/)?.[1] ?? "0", 10);
      return `count: ${n + 1}\n`;
    },
    realFsIO,
  );
}
