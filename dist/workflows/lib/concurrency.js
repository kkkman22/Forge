/**
 * concurrency.js — Forge Workflow Concurrency Bridge
 *
 * Provides chunkedParallel() to cap parallel agent dispatch
 * inside Claude Code Workflow runtime.
 *
 * Env priority:
 *   FORGE_MAX_PARALLEL_AGENTS_RUNTIME (dynamic 429 degrade)
 *   > FORGE_MAX_PARALLEL_AGENTS (static config)
 *   > 6 (default)
 */
const _raw = parseInt(process.env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME ||
    process.env.FORGE_MAX_PARALLEL_AGENTS ||
    "6", 10);
export const MAX_PARALLEL = Number.isFinite(_raw) && _raw > 0 ? _raw : 6;
/**
 * Execute async functions in capped-parallelism chunks.
 *
 * @param {Array<() => Promise<T>>} fns - async functions to execute
 * @param {object} opts
 * @param {number} opts.maxConcurrency - cap (default: MAX_PARALLEL from env)
 * @returns {Promise<T[]>} results in original order
 */
export async function chunkedParallel(fns, opts = {}) {
    const cap = opts.maxConcurrency ?? MAX_PARALLEL;
    if (fns.length === 0)
        return [];
    const results = [];
    for (let i = 0; i < fns.length; i += cap) {
        const chunk = fns.slice(i, i + cap);
        const batch = await Promise.all(chunk.map((fn) => fn()));
        results.push(...batch);
    }
    return results;
}
//# sourceMappingURL=concurrency.js.map