#!/usr/bin/env node
/**
 * Dist Sync Guard CLI.
 *
 * Detects three categories of drift between src/ and dist/:
 *   A) src file with no corresponding dist (missing in dist)
 *   B) dist file with no corresponding src (orphan in dist)
 *   C) compilation mismatch (tsc output differs from on-disk dist)
 *
 * Scans on-disk files (not git index) since compiled output is no longer tracked.
 * Exit 0 if clean, exit 1 if drift found.
 * Skippable via FORGE_SKIP_DIST_SYNC=1 or [dist-sync-skip] in commit message.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TEMP_OUTDIR = ".forge/.dist-sync-check";

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`${msg}\n`);
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function getTrackedFiles(patterns) {
  const result = execSync(`git ls-files -- ${patterns.join(" ")}`, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return result
    .trim()
    .split("\n")
    .filter(Boolean);
}

/**
 * Walk a directory and collect file paths matching extensions.
 */
function walkDir(dir, extensions) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(path.relative(process.cwd(), full));
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return files;
}

/**
 * Collect on-disk dist files (replaces getTrackedFiles for dist/).
 */
function getDiskDistFiles() {
  return walkDir(path.resolve("dist/src"), [".js", ".d.ts"])
    .filter((f) => !f.endsWith(".map"))
    .map((f) => f.replace(/\\/g, "/"));
}

function srcToExpectedDist(srcPath) {
  if (!srcPath.startsWith("src/")) return [];
  if (!srcPath.endsWith(".ts") || srcPath.endsWith(".d.ts")) return [];
  const relative = srcPath.slice(4, -3);
  return [`dist/src/${relative}.js`, `dist/src/${relative}.d.ts`];
}

function distToExpectedSrc(distPath) {
  if (!distPath.startsWith("dist/src/")) return null;
  if (distPath.endsWith(".map")) return null;
  let ext = null;
  if (distPath.endsWith(".js")) ext = ".js";
  else if (distPath.endsWith(".d.ts")) ext = ".d.ts";
  if (!ext) return null;
  const relative = distPath.slice(9, -ext.length);
  return `src/${relative}.ts`;
}

function checkSkip() {
  if (process.env.FORGE_SKIP_DIST_SYNC === "1") {
    log("⚠️  dist-sync: SKIPPED (FORGE_SKIP_DIST_SYNC=1)");
    return true;
  }
  try {
    const msg = execSync("git log -1 --format=%B", { encoding: "utf-8" }).trim();
    if (msg.includes("[dist-sync-skip]")) {
      log("⚠️  dist-sync: SKIPPED ([dist-sync-skip] in commit message)");
      return true;
    }
  } catch (e) {
    // no commits yet (fresh repo), skip check
    if (e.stderr) logError(`git log failed: ${e.stderr.slice(0, 200)}`);
  }
  return false;
}

function collectFileList() {
  const srcFiles = getTrackedFiles(["src/"])
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    // src/domain/ is an in-repo reference domain with its own tsconfig; the main
    // build intentionally does NOT compile it (INV-1, domain-example-reference-impl
    // REQ-01), so it must be absent from dist/src — not a drift signal.
    .filter((f) => !f.startsWith("src/domain/"));
  const distFiles = getDiskDistFiles();
  return { srcFiles, distFiles };
}

function detectMissingInDist(srcFiles, distSet) {
  const missing = [];
  for (const src of srcFiles) {
    const expected = srcToExpectedDist(src);
    if (expected.length === 0) continue;
    const notFound = expected.filter((p) => !distSet.has(p));
    if (notFound.length > 0) {
      missing.push({ srcPath: src, expectedDistPaths: notFound });
    }
  }
  return missing;
}

function detectOrphans(distFiles, srcSet) {
  const orphans = [];
  for (const dist of distFiles) {
    if (!dist.startsWith("dist/src/")) continue;
    if (dist.endsWith(".map")) continue;
    const src = distToExpectedSrc(dist);
    if (src && !srcSet.has(src)) {
      orphans.push({ distPath: dist, reason: "no-src" });
    }
  }
  return orphans;
}

function detectCompilationMismatch(_srcFiles, distSet) {
  const mismatch = [];

  // Ensure tsc compiles cleanly first
  try {
    execSync("npx tsc --noEmit", { encoding: "utf-8", stdio: "pipe" });
  } catch (e) {
    logError("❌ dist-sync: tsc --noEmit failed. Fix TypeScript errors first.");
    logError(e.stdout || e.message);
    return { mismatch, tscFailed: true };
  }

  // Create temp outdir
  const tmpDir = path.resolve(TEMP_OUTDIR);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Compile to temp dir
    execSync(
      `npx tsc --outDir ${tmpDir} --declaration`,
      { encoding: "utf-8", stdio: "pipe" },
    );

    // Collect fresh dist files from temp dir
    const freshFiles = new Map();
    function walkTmp(dir, base) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(base, entry.name);
        if (entry.isDirectory()) {
          walkTmp(fullPath, relPath);
        } else if (relPath.endsWith(".js") || relPath.endsWith(".d.ts")) {
          freshFiles.set(relPath, {
            sha256: sha256File(fullPath),
            size: fs.statSync(fullPath).size,
          });
        }
      }
    }
    walkTmp(tmpDir, "");

    // Compare with on-disk dist
    for (const [freshPath, fresh] of freshFiles) {
      // Normalize: tsc outputs src/foo.js, on-disk is dist/src/foo.js
      let diskDistPath = freshPath;
      if (freshPath.startsWith("src/")) {
        diskDistPath = `dist/${freshPath}`;
      }

      if (!distSet.has(diskDistPath)) continue;

      const onDiskPath = path.resolve(diskDistPath);
      if (!fs.existsSync(onDiskPath)) continue;

      const diskSha = sha256File(onDiskPath);

      if (fresh.sha256 !== diskSha) {
        mismatch.push({
          distPath: diskDistPath,
          srcPath: distToExpectedSrc(diskDistPath) ?? "",
          diff: "content-differs",
        });
      }
    }
  } finally {
    // Cleanup temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { mismatch, tscFailed: false };
}

function main() {
  if (checkSkip()) {
    process.exit(0);
  }

  const { srcFiles, distFiles } = collectFileList();
  const distSet = new Set(distFiles);
  const srcSet = new Set(srcFiles);

  // A) Missing in dist
  const missing = detectMissingInDist(srcFiles, distSet);
  // B) Orphans in dist
  const orphans = detectOrphans(distFiles, srcSet);
  // C) Compilation mismatch
  const { mismatch, tscFailed } = detectCompilationMismatch(srcFiles, distSet);

  if (tscFailed) {
    process.exit(1);
  }

  const totalDrift = missing.length + orphans.length + mismatch.length;

  if (totalDrift > 0) {
    log("❌ dist-sync: drift detected\n");

    if (missing.length > 0) {
      log("── Missing in dist (src exists, dist does not) ──");
      for (const m of missing) {
        log(`  ${m.srcPath}`);
        for (const p of m.expectedDistPaths) {
          log(`    → ${p}`);
        }
      }
      log("");
    }

    if (orphans.length > 0) {
      log("── Orphans in dist (dist exists, src does not) ──");
      for (const o of orphans) {
        log(`  ${o.distPath} (${o.reason})`);
      }
      log("");
    }

    if (mismatch.length > 0) {
      log("── Compilation mismatch (tsc output differs from tracked dist) ──");
      for (const m of mismatch) {
        log(`  ${m.distPath} (${m.diff})`);
      }
      log("");
    }

    log(`Fix: npm run dist:resync`);
    process.exit(1);
  }

  log(`dist-sync: OK — ${srcFiles.length} src files matched with dist/`);
  process.exit(0);
}

main();
