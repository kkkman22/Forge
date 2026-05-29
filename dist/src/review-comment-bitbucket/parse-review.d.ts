import type { Finding } from "./types.js";
export declare class ReviewMarkdownNotFoundError extends Error {
    readonly filePath: string;
    constructor(filePath: string);
}
export declare class ReviewMarkdownParseError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function parseReviewMarkdown(filePath: string): Promise<Finding[]>;
