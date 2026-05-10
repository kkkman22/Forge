export interface DriftReport {
  missingInDist: Array<{ srcPath: string; expectedDistPaths: string[] }>;
  orphansInDist: Array<{ distPath: string; reason: "no-src" | "src-deleted" }>;
  compilationMismatch: Array<{
    distPath: string;
    srcPath: string;
    diff: "content-differs" | "size-differs";
  }>;
  summary: {
    totalSrc: number;
    totalDist: number;
    drifted: number;
    cleanExit: boolean;
  };
}

export interface FileListing {
  trackedSrcFiles: string[];
  trackedDistFiles: string[];
  freshDistFiles?: Map<string, { sha256: string; size: number }>;
  trackedDistChecksums?: Map<string, { sha256: string; size: number }>;
}

const SRC_PREFIX = "src/";
const DIST_SRC_PREFIX = "dist/src/";

export function srcToExpectedDist(srcPath: string): string[] {
  if (!srcPath.startsWith(SRC_PREFIX)) return [];
  if (!srcPath.endsWith(".ts") || srcPath.endsWith(".d.ts")) return [];

  const relative = srcPath.slice(SRC_PREFIX.length, -".ts".length);
  return [`${DIST_SRC_PREFIX}${relative}.js`, `${DIST_SRC_PREFIX}${relative}.d.ts`];
}

export function distToExpectedSrc(distPath: string): string | null {
  if (!distPath.startsWith(DIST_SRC_PREFIX)) return null;
  if (distPath.endsWith(".map")) return null;

  const ext = distPath.endsWith(".js") ? ".js" : distPath.endsWith(".d.ts") ? ".d.ts" : null;
  if (!ext) return null;

  const relative = distPath.slice(DIST_SRC_PREFIX.length, -ext.length);
  return `${SRC_PREFIX}${relative}.ts`;
}

export function detectDrift(input: FileListing): DriftReport {
  const { trackedSrcFiles, trackedDistFiles, freshDistFiles, trackedDistChecksums } = input;

  const distSet = new Set(trackedDistFiles);
  const srcSet = new Set(trackedSrcFiles);

  const missingInDist: DriftReport["missingInDist"] = [];
  for (const src of trackedSrcFiles) {
    const expected = srcToExpectedDist(src);
    if (expected.length === 0) continue;
    const missing = expected.filter((p) => !distSet.has(p));
    if (missing.length > 0) {
      missingInDist.push({ srcPath: src, expectedDistPaths: missing });
    }
  }

  const orphansInDist: DriftReport["orphansInDist"] = [];
  for (const dist of trackedDistFiles) {
    if (!dist.startsWith(DIST_SRC_PREFIX)) continue;
    if (dist.endsWith(".map")) continue;
    const src = distToExpectedSrc(dist);
    if (src && !srcSet.has(src)) {
      orphansInDist.push({ distPath: dist, reason: "no-src" });
    }
  }

  const compilationMismatch: DriftReport["compilationMismatch"] = [];
  if (freshDistFiles && trackedDistChecksums) {
    for (const [distPath, fresh] of freshDistFiles) {
      const tracked = trackedDistChecksums.get(distPath);
      if (!tracked) continue;
      if (fresh.sha256 !== tracked.sha256) {
        compilationMismatch.push({
          distPath,
          srcPath: distToExpectedSrc(distPath) ?? "",
          diff: "content-differs",
        });
      } else if (fresh.size !== tracked.size) {
        compilationMismatch.push({
          distPath,
          srcPath: distToExpectedSrc(distPath) ?? "",
          diff: "size-differs",
        });
      }
    }
  }

  const drifted = missingInDist.length + orphansInDist.length + compilationMismatch.length;

  return {
    missingInDist,
    orphansInDist,
    compilationMismatch,
    summary: {
      totalSrc: trackedSrcFiles.length,
      totalDist: trackedDistFiles.length,
      drifted,
      cleanExit: drifted === 0,
    },
  };
}
