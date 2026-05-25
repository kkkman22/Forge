import type { DiagnosticRecord, DocPath, RendererRegistry } from "../types.js";
/**
 * Synchronise all embed directives in `fileContent` using the provided
 * `registry` and `ssotData`.
 *
 * - ssot-block directives: resolved via RendererRegistry, source from ssotData.
 * - file-embed directives: content looked up in ssotData by topic key.
 * - Returns { content, diagnostics } where content has all valid directives
 *   replaced and diagnostics lists every issue encountered.
 */
export declare function syncEmbeds(fileContent: string, filePath: DocPath, registry: RendererRegistry, ssotData: Map<string, unknown>): {
    content: string;
    diagnostics: DiagnosticRecord[];
};
