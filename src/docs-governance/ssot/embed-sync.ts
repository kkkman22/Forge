import { parseEmbeds } from "./embed-parser.js";
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
export function syncEmbeds(
  fileContent: string,
  filePath: DocPath,
  registry: RendererRegistry,
  ssotData: Map<string, string>,
): { content: string; diagnostics: DiagnosticRecord[] } {
  const allDiagnostics: DiagnosticRecord[] = [];
  const { directives, diagnostics: parseDiags } = parseEmbeds(fileContent, filePath);
  allDiagnostics.push(...parseDiags);

  // If parsing errors exist, return original content unchanged.
  // Only EMBED_UNCLOSED / EMBED_TOPIC_MISMATCH / EMBED_NESTING / EMBED_ORPHAN_END
  // mean we should not modify — they represent structural problems.
  const structuralErrors = parseDiags.filter(
    (d) =>
      d.severity === "error" &&
      (d.code === "EMBED_UNCLOSED" ||
        d.code === "EMBED_TOPIC_MISMATCH" ||
        d.code === "EMBED_NESTING" ||
        d.code === "EMBED_ORPHAN_END"),
  );

  if (structuralErrors.length > 0) {
    return { content: fileContent, diagnostics: allDiagnostics };
  }

  // Process directives in reverse order so that line-number-based
  // replacements do not shift subsequent directives.
  const sorted = [...directives].sort((a, b) => b.beginLine - a.beginLine);

  let content = fileContent;
  const lines = content.split("\n");

  for (const directive of sorted) {
    if (directive.kind === "file-embed") {
      // #[[file:relative]] — look up in ssotData
      const fileContent = ssotData.get(directive.topic);
      if (fileContent === undefined) {
        allDiagnostics.push({
          script: "embed-sync",
          severity: "error",
          file: filePath,
          line: directive.beginLine,
          message: `file-embed content not found for "${directive.topic}"`,
          code: "EMBED_FILE_NOT_FOUND",
        });
        continue;
      }
      content = replaceLineRange(content, directive.beginLine, directive.endLine, fileContent);
    } else {
      // ssot-block — resolve renderer and render
      const renderer = registry.resolve(directive.render);
      if (!renderer) {
        allDiagnostics.push({
          script: "embed-sync",
          severity: "error",
          file: filePath,
          line: directive.beginLine,
          message: `unknown renderer "${directive.render}"`,
          code: "EMBED_UNKNOWN_RENDERER",
        });
        continue;
      }

      const source = ssotData.get(directive.topic) ?? null;
      const result = renderer({
        topic: directive.topic,
        renderer: directive.render,
        args: directive.args,
        source,
      });

      allDiagnostics.push(...result.diagnostics);

      // Build replacement: begin marker + rendered content + end marker
      const lines = content.split("\n");
      const beginLine = lines[directive.beginLine - 1];
      const endLine = lines[directive.endLine - 1];
      const replacement = `${beginLine}\n${result.markdown}\n${endLine}`;

      content = replaceLineRange(content, directive.beginLine, directive.endLine, replacement);
    }
  }

  return { content, diagnostics: allDiagnostics };
}

/**
 * Replace lines [startLine, endLine] (1-indexed, inclusive) in `content`
 * with `replacement` text.
 */
function replaceLineRange(
  content: string,
  startLine: number,
  endLine: number,
  replacement: string,
): string {
  const lines = content.split("\n");
  const before = lines.slice(0, startLine - 1);
  const after = lines.slice(endLine);
  const replacementLines = replacement.split("\n");
  return [...before, ...replacementLines, ...after].join("\n");
}
