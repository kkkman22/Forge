export interface DriftReport {
    missingInDist: Array<{
        srcPath: string;
        expectedDistPaths: string[];
    }>;
    orphansInDist: Array<{
        distPath: string;
        reason: "no-src" | "src-deleted";
    }>;
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
    freshDistFiles?: Map<string, {
        sha256: string;
        size: number;
    }>;
    trackedDistChecksums?: Map<string, {
        sha256: string;
        size: number;
    }>;
}
export declare function srcToExpectedDist(srcPath: string): string[];
export declare function distToExpectedSrc(distPath: string): string | null;
export declare function detectDrift(input: FileListing): DriftReport;
