import type { DiagnosticRecord, Frontmatter } from "../types.js";
export interface ParseResult {
    frontmatter: Frontmatter | null;
    body: string;
    diagnostics: DiagnosticRecord[];
}
export declare function parseFrontmatter(text: string): ParseResult;
