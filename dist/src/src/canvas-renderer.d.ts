/**
 * Canvas renderer — generates single-page dark-themed HTML review artifact.
 *
 * Reads local Forge data (reviews + diff + log) and optional Bitbucket MCP
 * enrichment, renders into a three-column HTML layout with findings data
 * embedded as a safe JSON island [R4.8].
 *
 * **Validates: Requirements R4.1–R4.10**
 */
export interface CanvasFinding {
    severity: string;
    file: string;
    issue: string;
    suggestion: string;
}
export interface CanvasFindings {
    spec: readonly CanvasFinding[];
    quality: readonly CanvasFinding[];
    security: readonly CanvasFinding[];
}
export interface CanvasOptions {
    topic: string;
    cwd?: string;
    forgeDir?: string;
    findings: CanvasFindings;
}
export interface CanvasResult {
    html: string;
    outputPath: string;
}
/**
 * Render the review canvas HTML.
 *
 * Steps:
 *   1. Read template files (base.html, renderer.js)
 *   2. Prepare findings data
 *   3. Embed as safe JSON island (JSON.stringify + HTML-escape)
 *   4. Write output to .forge/reviews/<topic>.canvas.html
 */
export declare function renderCanvas(options: CanvasOptions): Promise<CanvasResult>;
