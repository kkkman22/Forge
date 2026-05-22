#!/usr/bin/env node
/**
 * Run browser QA sequence (R8.1–R8.9).
 * Returns { verdict, failures, steps, timestamp }.
 * Never throws (R8.8).
 */
export function runBrowserQa({ forgeDir, writeArtifact, steps, }?: {
    forgeDir?: string | undefined;
    writeArtifact?: boolean | undefined;
    steps?: {
        name: string;
        args: string[];
    }[] | undefined;
}): Promise<{
    verdict: string;
    failures: never[];
    steps: never[];
    timestamp: string;
}>;
