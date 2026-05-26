import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("concurrency.js", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function importFresh() {
    vi.resetModules();
    return import("../../workflows/lib/concurrency.js");
  }

  describe("MAX_PARALLEL", () => {
    it("defaults to 6 when no env set", async () => {
      delete process.env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME;
      delete process.env.FORGE_MAX_PARALLEL_AGENTS;
      const mod = await importFresh();
      expect(mod.MAX_PARALLEL).toBe(6);
    });

    it("reads FORGE_MAX_PARALLEL_AGENTS when set", async () => {
      process.env.FORGE_MAX_PARALLEL_AGENTS = "4";
      delete process.env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME;
      const mod = await importFresh();
      expect(mod.MAX_PARALLEL).toBe(4);
    });

    it("FORGE_MAX_PARALLEL_AGENTS_RUNTIME takes priority", async () => {
      process.env.FORGE_MAX_PARALLEL_AGENTS = "4";
      process.env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME = "2";
      const mod = await importFresh();
      expect(mod.MAX_PARALLEL).toBe(2);
    });
  });

  describe("chunkedParallel", () => {
    it("executes all functions and returns results in order", async () => {
      const { chunkedParallel } = await importFresh();
      const fns = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)];
      const results = await chunkedParallel(fns);
      expect(results).toEqual([1, 2, 3]);
    });

    it("chunks execution to respect maxConcurrency", async () => {
      const { chunkedParallel } = await importFresh();
      let maxConcurrent = 0;
      let current = 0;
      const order: number[] = [];

      const fns = Array.from({ length: 10 }, (_, i) => () => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        return new Promise<number>((resolve) => {
          setTimeout(() => {
            current--;
            order.push(i);
            resolve(i);
          }, 5);
        });
      });

      const results = await chunkedParallel(fns, { maxConcurrency: 3 });
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it("handles empty input array", async () => {
      const { chunkedParallel } = await importFresh();
      const results = await chunkedParallel([]);
      expect(results).toEqual([]);
    });

    it("handles single item", async () => {
      const { chunkedParallel } = await importFresh();
      const results = await chunkedParallel([() => Promise.resolve("only")]);
      expect(results).toEqual(["only"]);
    });
  });

  // ---------------------------------------------------------------------------
  // T11: Review L0 [3,1] chunked batch + concurrency property tests
  // ---------------------------------------------------------------------------

  describe("review L0 chunkedParallel batching (R5)", () => {
    it("multi-agent-review.js calls chunkedParallel with REVIEWERS", () => {
      const wfPath = join(process.cwd(), "workflows", "multi-agent-review.js");
      const src = readFileSync(wfPath, "utf-8");
      expect(src).toContain("chunkedParallel(");
      expect(src).toContain("REVIEWERS.map");
    });

    it("3 reviewers fit in 1 chunk with maxConcurrency=3", async () => {
      const { chunkedParallel } = await importFresh();
      let maxConcurrent = 0;
      let current = 0;

      const fns = Array.from({ length: 3 }, (_, i) => () => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        return new Promise<number>((resolve) => {
          setTimeout(() => {
            current--;
            resolve(i);
          }, 5);
        });
      });

      const results = await chunkedParallel(fns, { maxConcurrency: 3 });
      expect(results).toEqual([0, 1, 2]);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it("4 reviewers chunk into [3,1] with maxConcurrency=3", async () => {
      const { chunkedParallel } = await importFresh();
      let maxConcurrent = 0;
      let current = 0;
      const startOrder: number[][] = [];
      const batchStarts: number[] = [];

      const fns = Array.from({ length: 4 }, (_, i) => () => {
        current++;
        if (current === 1) batchStarts.push(i);
        maxConcurrent = Math.max(maxConcurrent, current);
        return new Promise<number>((resolve) => {
          setTimeout(() => {
            current--;
            resolve(i);
          }, 20);
        });
      });

      const results = await chunkedParallel(fns, { maxConcurrency: 3 });
      expect(results).toEqual([0, 1, 2, 3]);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
      // With 4 items and maxConcurrency=3, we expect 2 batches
      expect(batchStarts.length).toBe(2);
    });

    it("collects findings from all dimensions without double-counting", async () => {
      const { chunkedParallel } = await importFresh();

      const reviewers = [
        () => Promise.resolve({ dimension: "spec-check", findings: ["f1", "f2"] }),
        () => Promise.resolve({ dimension: "quality-check", findings: ["f3", "f4"] }),
        () => Promise.resolve({ dimension: "security-check", findings: ["f5", "f6"] }),
      ];

      const results = await chunkedParallel(reviewers, { maxConcurrency: 3 });
      const allFindings = results.flatMap((d) => d.findings);
      expect(allFindings).toEqual(["f1", "f2", "f3", "f4", "f5", "f6"]);
      expect(allFindings.length).toBe(6);
    });
  });

  describe("chunkedParallel concurrency property (R5.2)", () => {
    it("maxConcurrency is never exceeded for 1..20 reviewers", async () => {
      const { chunkedParallel } = await importFresh();

      for (let n = 1; n <= 20; n++) {
        let maxConcurrent = 0;
        let current = 0;

        const fns = Array.from({ length: n }, (_, i) => () => {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
          return new Promise<number>((resolve) => {
            setTimeout(() => {
              current--;
              resolve(i);
            }, 2);
          });
        });

        const results = await chunkedParallel(fns, { maxConcurrency: 3 });
        expect(results.length).toBe(n);
        expect(maxConcurrent).toBeLessThanOrEqual(3);
      }
    });
  });
});
