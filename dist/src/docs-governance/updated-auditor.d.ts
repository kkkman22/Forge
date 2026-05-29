export interface DiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
}
export interface FrontmatterRange {
    start: number;
    end: number;
}
export declare function findFrontmatterRange(lines: string[]): FrontmatterRange | null;
export declare function parseDiffHunks(diff: string): DiffHunk[];
export declare function isFrontmatterOnlyChange(fileContent: string, diff: string): boolean;
