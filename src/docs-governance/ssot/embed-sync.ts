import type { DiagnosticRecord, DocPath, RendererRegistry } from "../types.js";
import { parseEmbeds } from "./embed-parser.js";

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
  ssotData: Map<string, unknown>,
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

  for (const directive of sorted) {
    if (directive.kind === "file-embed") {
      const embedContent = ssotData.get(directive.topic);
      if (embedContent === undefined) {
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
      content = replaceLineRange(
        content,
        directive.beginLine,
        directive.endLine,
        String(embedContent),
      );
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

      if (directive.beginLine === directive.endLine) {
        // Single-line embed: replace inner content between markers on same line
        const lines = content.split("\n");
        const line = lines[directive.beginLine - 1];
        const beginMarker = `<!-- ssot:begin topic=${directive.topic} render=${directive.render}`;
        const endMarker = `<!-- ssot:end topic=${directive.topic} -->`;
        const beginIdx = line.indexOf(beginMarker);
        const endIdx = line.indexOf(endMarker);
        if (beginIdx !== -1 && endIdx !== -1) {
          const afterBegin = beginIdx + line.substring(beginIdx).indexOf("-->") + 3;
          lines[directive.beginLine - 1] =
            line.substring(0, afterBegin) + result.markdown + line.substring(endIdx);
          content = lines.join("\n");
        }
      } else {
        // Multi-line embed: begin marker + rendered content + end marker
        const lines = content.split("\n");
        const beginLine = lines[directive.beginLine - 1];
        const endLine = lines[directive.endLine - 1];
        const replacement = `${beginLine}\n${result.markdown}\n${endLine}`;
        content = replaceLineRange(content, directive.beginLine, directive.endLine, replacement);
      }
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
