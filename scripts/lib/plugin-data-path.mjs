/**
 * plugin-data-path.mjs — Shared plugin data directory resolver.
 *
 * Provides a unified path to Claude Code's plugin-persistent data directory.
 * Priority: ${CLAUDE_PLUGIN_DATA}/tinkerman/ → ~/.claude/plugins/data/forge/
 * Falls back to null when neither is writable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

/**
 * Return the plugin data root directory for Forge.
 *
 * 1. If CLAUDE_PLUGIN_DATA is set → ${CLAUDE_PLUGIN_DATA}/tinkerman/
 * 2. Otherwise → ~/.claude/plugins/data/forge/
 * 3. If directory creation fails → null (caller decides fallback strategy)
 *
 * The directory is auto-created (recursive) on first call.
 *
 * @returns {string|null} Absolute path, or null if not writable.
 */
export function getPluginDataDir() {
  const envDir = process.env.CLAUDE_PLUGIN_DATA;

  // Validate env var: must be an absolute, non-empty path without traversal
  if (envDir) {
    if (!envDir.startsWith("/") || envDir.includes("..")) {
      process.stderr.write(
        `[plugin-data] Invalid CLAUDE_PLUGIN_DATA: "${envDir}" — must be absolute path without ".."\n`,
      );
      // Fall through to homedir fallback
    } else {
      const base = join(envDir, "tinkerman");
      const abs = resolve(base);
      try {
        mkdirSync(abs, { recursive: true, mode: 0o700 });
        return abs;
      } catch (err) {
        process.stderr.write(
          `[plugin-data] Cannot create ${abs}: ${err.message}\n`,
        );
        // Fall through to homedir fallback
      }
    }
  }

  // Fallback: ~/.claude/plugins/data/forge/
  const fallback = join(homedir(), ".claude", "plugins", "data", "tinkerman");
  const abs = resolve(fallback);
  try {
    mkdirSync(abs, { recursive: true, mode: 0o700 });
    return abs;
  } catch (err) {
    process.stderr.write(
      `[plugin-data] Cannot create fallback ${abs}: ${err.message}\n`,
    );
    return null;
  }
}

/**
 * Return a cache file path under the plugin data directory.
 * Validates that filename is a simple basename (no path traversal).
 *
 * @param {string} filename — Cache filename (e.g. "evolved-rules-cache.json")
 * @returns {string|null} Absolute path, or null if plugin data dir unavailable.
 */
export function getCachePath(filename) {
  // Sanitize: reject filenames with path separators, traversal, or empty
  if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return null;
  }
  // Ensure filename is a plain basename (no directory component)
  if (basename(filename) !== filename) {
    return null;
  }

  const dir = getPluginDataDir();
  if (!dir) return null;
  return join(dir, filename);
}

/**
 * Migrate old cache files from project-local .tinkerman/.cache/ to plugin data dir.
 * Old files are preserved (not deleted). Does not overwrite existing new cache.
 *
 * @param {string} projectDir — Absolute path to the project root.
 * @returns {{ migrated: number, skipped: number, errors: number }} Migration summary.
 */
export function migrateOldCache(projectDir) {
  const result = { migrated: 0, skipped: 0, errors: 0 };
  const oldCacheDir = join(projectDir, ".tinkerman", ".cache");
  if (!existsSync(oldCacheDir)) return result;

  const cacheFiles = [
    "evolved-rules-cache.json",
    "knowledge-cache.json",
    "rule-violations.json",
  ];

  for (const filename of cacheFiles) {
    const oldPath = join(oldCacheDir, filename);
    if (!existsSync(oldPath)) {
      result.skipped++;
      continue;
    }

    const newPath = getCachePath(filename);
    if (!newPath) {
      result.skipped++;
      continue;
    }

    // Don't overwrite existing new cache
    if (existsSync(newPath)) {
      result.skipped++;
      continue;
    }

    try {
      const data = readFileSync(oldPath, "utf-8");
      // Validate it's parseable JSON before migrating
      JSON.parse(data);
      writeFileSync(newPath, data, { mode: 0o600 });
      result.migrated++;
    } catch {
      result.errors++;
    }
  }

  return result;
}
