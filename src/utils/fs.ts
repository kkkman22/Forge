/**
 * Shared filesystem utilities — async helpers used across multiple modules.
 *
 * Centralizes common async fs operations to prevent duplication.
 */

import { readFile, stat } from "node:fs/promises";

/**
 * Async file existence check — resolves true/false, never rejects.
 *
 * Uses `stat` which is the lightest check (no file content read).
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Async file existence check via readFile — useful when the caller
 * needs to verify the file is readable (not just present).
 */
export async function pathReadable(path: string): Promise<boolean> {
  try {
    await readFile(path, { encoding: null, flag: "r" });
    return true;
  } catch {
    return false;
  }
}
