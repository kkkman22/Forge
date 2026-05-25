import type { Dirent } from "node:fs";
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface WalkOptions {
  skipHidden?: boolean;
  skipSsot?: boolean;
  extensions?: string[];
  relativeTo?: string;
  excludeFn?: (name: string) => boolean;
  symlinkSafe?: boolean;
  allowDotDirs?: string[];
  excludedPrefixes?: readonly string[];
}

const DEFAULT_EXTENSIONS = [".md"];

export function walkMdFiles(dir: string, opts: WalkOptions = {}): string[] {
  const {
    skipHidden = true,
    skipSsot = false,
    extensions = DEFAULT_EXTENSIONS,
    relativeTo,
    excludeFn,
    symlinkSafe = false,
    allowDotDirs = [],
    excludedPrefixes = [],
  } = opts;

  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const resolvedRoot = symlinkSafe ? resolve(dir) : undefined;

  function walk(current: string): void {
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(current, { withFileTypes: true }) as Dirent<string>[];
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);

      if (symlinkSafe) {
        const stat = lstatSync(fullPath);
        if (stat.isSymbolicLink()) continue;
        if (resolvedRoot && !resolve(fullPath).startsWith(resolvedRoot)) continue;
      }

      if (skipHidden && entry.name.startsWith(".") && !allowDotDirs.includes(entry.name)) continue;
      if (skipSsot && entry.name === "_ssot" && entry.isDirectory()) continue;

      if (relativeTo) {
        const rel = relative(relativeTo, fullPath);
        if (excludedPrefixes.some((p) => rel.startsWith(p))) continue;
      }

      let isDir: boolean;
      let isFile: boolean;
      if (symlinkSafe) {
        const stat = lstatSync(fullPath);
        isDir = stat.isDirectory();
        isFile = stat.isFile();
      } else {
        try {
          const stat = statSync(fullPath);
          isDir = stat.isDirectory();
          isFile = stat.isFile();
        } catch {
          continue;
        }
      }

      if (isDir) {
        walk(fullPath);
      } else if (isFile && extensions.some((ext) => entry.name.endsWith(ext))) {
        if (excludeFn?.(entry.name)) continue;
        results.push(relativeTo ? relative(relativeTo, fullPath) : fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

export function shouldExcludeIndex(filename: string): boolean {
  if (filename.match(/^INDEX/i)) return true;
  if (filename === "README.md") return true;
  return false;
}
