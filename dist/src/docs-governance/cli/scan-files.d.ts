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
export declare function walkMdFiles(dir: string, opts?: WalkOptions): string[];
export declare function shouldExcludeIndex(filename: string): boolean;
