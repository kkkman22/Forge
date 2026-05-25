import type { DiagnosticRecord, DocPath, EmbedDirective } from "../types.js";
export declare function parseEmbeds(fileContent: string, filePath: DocPath): {
    directives: EmbedDirective[];
    diagnostics: DiagnosticRecord[];
};
