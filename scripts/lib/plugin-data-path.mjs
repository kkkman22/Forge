#!/usr/bin/env node
/**
 * plugin-data-path.mjs — Shared plugin data directory resolver.
 *
 * Provides a unified path to Claude Code's plugin-persistent data directory.
 * Priority: ${CLAUDE_PLUGIN_DATA}/forge/ → ~/.claude/plugins/data/forge/
 * Falls back to null when neither is writable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

/**
 * Return the plugin data root directory for Forge.
 *
 * 1. If CLAUDE_PLUGIN_DATA is set → ${CLAUDE_PLUGIN_DATA}/forge/
 * 2. Otherwise → ~/.claude/plugins/data/forge/
 * 3. If directory creation fails → null (caller decides fallback strategy)
 *
 * The directory is auto-created (recursive) on first call.
 *
 * @returns {string|null} Absolute path, or null if not writable.
 */
export function getPluginDataDir() {
  const envDir = process.env.CLAUDE_PLUGIN_DATA;
  const base = envDir
    ? join(envDir, "forge")
    : join(homedir(), ".claude", "plugins", "data", "forge");

  const abs = resolve(base);

  try {
    mkdirSync(abs, { recursive: true });
    return abs;
  } catch {
    return null;
  }
}

/**
 * Return a cache file path under the plugin data directory.
 *
 * @param {string} filename — Cache filename (e.g. "evolved-rules-cache.json")
 * @returns {string|null} Absolute path, or null if plugin data dir unavailable.
 */
export function getCachePath(filename) {
  const dir = getPluginDataDir();
  if (!dir) return null;
  return join(dir, filename);
}

/**
 * Migrate old cache files from project-local .forge/.cache/ to plugin data dir.
 * Old files are preserved (not deleted). Does not overwrite existing new cache.
 *
 * @param {string} projectDir — Absolute path to the project root.
 */
export function migrateOldCache(projectDir) {
  const oldCacheDir = join(projectDir, ".forge", ".cache");
  if (!existsSync(oldCacheDir)) return;

  const cacheFiles = [
    "evolved-rules-cache.json",
    "knowledge-cache.json",
    "rule-violations.json",
  ];

  for (const filename of cacheFiles) {
    const oldPath = join(oldCacheDir, filename);
    if (!existsSync(oldPath)) continue;

    const newPath = getCachePath(filename);
    if (!newPath) continue;

    // Don't overwrite existing new cache
    if (existsSync(newPath)) continue;

    try {
      const data = readFileSync(oldPath, "utf-8");
      // Validate it's parseable JSON before migrating
      JSON.parse(data);
      writeFileSync(newPath, data, "utf-8");
    } catch {
      // Skip corrupted old cache files
    }
  }
}
