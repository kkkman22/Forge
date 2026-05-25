export interface HeadingEntry {
    text: string;
    anchor: string;
}
export interface ExtractedLink {
    target: string;
    line: number;
    raw: string;
}
export declare function gfmAnchor(text: string): string;
export declare function dedupAnchorsInDoc(headings: HeadingEntry[]): void;
export declare function extractLinks(text: string): ExtractedLink[];
