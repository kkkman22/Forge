import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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
      const fns = [
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3),
      ];
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
});
