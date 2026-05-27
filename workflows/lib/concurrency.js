/**
 * Forge concurrency bridge for plugin workflows.
 *
 * Bounds parallel execution so the Claude Code Workflow runtime never exceeds
 * Forge's session-wide subagent budget (`max_parallel_agents`, default 6).
 *
 * Forge-authored workflow files MUST route every parallel fan-out through
 * `chunkedParallel(items, fn, { maxConcurrency })` instead of calling the
 * workflow runtime's built-in `parallel()` directly. This keeps the 429
 * degradation ladder (T11) effective and prevents global-state leakage
 * across subcommand sessions.
 *
 * Env priority (highest first):
 *   FORGE_MAX_PARALLEL_AGENTS_RUNTIME  ← dynamic 429 degrade override
 *   FORGE_MAX_PARALLEL_AGENTS          ← .forge/config.md max_parallel_agents
 *   default 6
 */

const DEFAULT_MAX = 6;

/**
 * Resolve the effective max concurrency from env vars.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] env source
 * @returns {number} positive integer ≥ 1
 */
export function resolveMaxConcurrency(env = process.env) {
  const candidates = [env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME, env.FORGE_MAX_PARALLEL_AGENTS];
  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number.parseInt(String(raw), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_MAX;
}

/**
 * Run `fn` over `items` with bounded concurrency.
 *
 * Output order matches input order. Rejects on the first task error and
 * stops scheduling further tasks (in-flight tasks may still resolve).
 *
 * @template T, U
 * @param {T[]} items
 * @param {(item: T, idx: number) => Promise<U>} fn
 * @param {{ maxConcurrency?: number }} [opts]
 * @returns {Promise<U[]>}
 */
export async function chunkedParallel(items, fn, opts = {}) {
  if (!Array.isArray(items)) {
    throw new TypeError("chunkedParallel: items must be an array");
  }
  if (typeof fn !== "function") {
    throw new TypeError("chunkedParallel: fn must be a function");
  }
  const max = Math.max(
    1,
    Math.floor(opts.maxConcurrency ?? resolveMaxConcurrency()),
  );
  const len = items.length;
  if (len === 0) return [];

  const results = new Array(len);
  let nextIdx = 0;
  let aborted = false;
  let abortError = null;

  async function worker() {
    while (!aborted) {
      const idx = nextIdx;
      if (idx >= len) return;
      nextIdx = idx + 1;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        if (!aborted) {
          aborted = true;
          abortError = err;
        }
        return;
      }
    }
  }

  const workerCount = Math.min(max, len);
  const workers = [];
  for (let i = 0; i < workerCount; i++) workers.push(worker());
  await Promise.all(workers);

  if (aborted && abortError) throw abortError;
  return results;
}

export const DEFAULT_MAX_CONCURRENCY = DEFAULT_MAX;
