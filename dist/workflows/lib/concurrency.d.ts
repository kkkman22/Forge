/**
 * Execute async functions in capped-parallelism chunks.
 *
 * @param {Array<() => Promise<T>>} fns - async functions to execute
 * @param {object} opts
 * @param {number} opts.maxConcurrency - cap (default: MAX_PARALLEL from env)
 * @returns {Promise<T[]>} results in original order
 */
export function chunkedParallel(fns: Array<() => Promise<T>>, opts?: {
    maxConcurrency: number;
}): Promise<T[]>;
export const MAX_PARALLEL: number;
