import type { DiagnosticRecord, DocPath, EmbedDirective } from "../types.js";

const BEGIN_RE = /<!--\s*ssot:begin\s+topic=(\S+)\s+render=(\S+)(.*?)\s*-->/;
const END_RE = /<!--\s*ssot:end\s+topic=(\S+)\s*-->/;
const FILE_EMBED_RE = /^#\[\[file:([^\]]+)]]$/;
const KV_RE = /(\w+)=(\S+)/g;

function diag(
  severity: DiagnosticRecord["severity"],
  message: string,
  file: DocPath,
  line?: number,
  code?: string,
): DiagnosticRecord {
  return { script: "embed-parser", severity, file, message, line, code };
}

function parseArgs(raw: string): Record<string, string> {
  const args: Record<string, string> = {};
  if (!raw) return args;
  let match: RegExpExecArray | null;
  const re = new RegExp(KV_RE.source, "g");
  while ((match = re.exec(raw)) !== null) {
    args[match[1]] = match[2];
  }
  return args;
}

export function parseEmbeds(
  fileContent: string,
  filePath: DocPath,
): { directives: EmbedDirective[]; diagnostics: DiagnosticRecord[] } {
  const diagnostics: DiagnosticRecord[] = [];
  const directives: EmbedDirective[] = [];
  const lines = fileContent.split("\n");

  let i = 0;
  let insideBlock = false;
  let currentTopic = "";
  let currentRender = "";
  let currentArgs: Record<string, string> = {};
  let beginLine = 0;
  // Track character offset for raw innerContent extraction
  let beginCharEnd = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineNum = i + 1; // 1-indexed

    // Check for file-embed (only outside ssot-block)
    if (!insideBlock) {
      const trimmed = line.trim();
      const fileMatch = FILE_EMBED_RE.exec(trimmed);
      if (fileMatch) {
        const embedPath = fileMatch[1];
        directives.push({
          file: filePath,
          topic: `file:${embedPath}`,
          render: "file-embed",
          args: {},
          beginLine: lineNum,
          endLine: lineNum,
          innerContent: "",
          kind: "file-embed",
        });
        i++;
        continue;
      }
    }

    // Check for begin marker
    const beginMatch = BEGIN_RE.exec(line);
    if (beginMatch) {
      if (insideBlock) {
        // Nesting detected
        diagnostics.push(
          diag("error", `Nested ssot:begin detected for topic "${beginMatch[1]}" inside "${currentTopic}" — nesting is not allowed`, filePath, lineNum, "EMBED_NESTING"),
        );
        i++;
        continue;
      }
      insideBlock = true;
      currentTopic = beginMatch[1];
      currentRender = beginMatch[2];
      currentArgs = parseArgs(beginMatch[3]);
      beginLine = lineNum;
      // Calculate char offset just after the begin marker line (including its newline)
      beginCharEnd = lineEndOffset(lines, i);
      i++;
      continue;
    }

    // Check for end marker
    const endMatch = END_RE.exec(line);
    if (endMatch) {
      if (!insideBlock) {
        // Orphaned end marker
        diagnostics.push(
          diag("error", `Orphaned ssot:end for topic "${endMatch[1]}" without matching begin`, filePath, lineNum, "EMBED_ORPHAN_END"),
        );
        i++;
        continue;
      }
      const endTopic = endMatch[1];
      if (endTopic !== currentTopic) {
        // Topic mismatch
        diagnostics.push(
          diag("error", `Topic mismatch: begin has "${currentTopic}" but end has "${endTopic}"`, filePath, lineNum, "EMBED_TOPIC_MISMATCH"),
        );
        // Reset block state
        insideBlock = false;
        i++;
        continue;
      }
      // Extract raw inner content from original string
      const endCharStart = lineStartOffset(lines, i);
      const innerContent = fileContent.substring(beginCharEnd, endCharStart);
      // Complete directive
      directives.push({
        file: filePath,
        topic: currentTopic,
        render: currentRender,
        args: currentArgs,
        beginLine,
        endLine: lineNum,
        innerContent,
        kind: "ssot-block",
      });
      insideBlock = false;
      i++;
      continue;
    }

    i++;
  }

  // Unclosed block at end of file
  if (insideBlock) {
    diagnostics.push(
      diag("error", `unclosed ssot:begin for topic "${currentTopic}" at line ${beginLine}`, filePath, beginLine, "EMBED_UNCLOSED"),
    );
  }

  return { directives, diagnostics };
}

/** Character offset of the start of line `lineIdx` (0-indexed). */
function lineStartOffset(lines: string[], lineIdx: number): number {
  let offset = 0;
  for (let i = 0; i < lineIdx; i++) {
    offset += lines[i].length + 1; // +1 for "\n"
  }
  return offset;
}

/** Character offset just past line `lineIdx` text (NOT including its trailing newline). */
function lineEndOffset(lines: string[], lineIdx: number): number {
  return lineStartOffset(lines, lineIdx) + lines[lineIdx].length;
}
