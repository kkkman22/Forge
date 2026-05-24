import type { DiagnosticRecord, Severity } from "../types.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  notice: 1,
  info: 0,
};

export function truncateMessage(msg: string): string {
  if (msg.length <= 500) return msg;
  return `${msg.slice(0, 500)}…[truncated]`;
}

export function sortDiagnostics(records: DiagnosticRecord[]): DiagnosticRecord[] {
  return [...records].sort((a, b) => {
    const sd = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (sd !== 0) return sd;
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });
}

export function formatDiagnostics(records: DiagnosticRecord[]): string {
  const sorted = sortDiagnostics(records);
  const lines = sorted.map((r) => {
    const loc = r.line ? `:${r.line}${r.column ? `:${r.column}` : ""}` : "";
    return `${r.file}${loc}  ${r.severity}  ${r.script}   ${truncateMessage(r.message)}`;
  });
  lines.push(summarize(records));
  return lines.join("\n");
}

export function formatNdjson(records: DiagnosticRecord[]): string {
  return records
    .map((r) =>
      JSON.stringify({
        script: r.script,
        severity: r.severity,
        file: r.file,
        ...(r.line !== undefined && { line: r.line }),
        ...(r.column !== undefined && { column: r.column }),
        ...(r.code !== undefined && { code: r.code }),
        message: truncateMessage(r.message),
      }),
    )
    .join("\n");
}

export function summarize(records: DiagnosticRecord[]): string {
  const counts: Record<string, number> = {
    critical: 0,
    error: 0,
    warning: 0,
  };
  for (const r of records) {
    if (r.severity in counts) counts[r.severity]++;
  }
  return `Summary: ${counts.critical} critical, ${counts.error} error, ${counts.warning} warning`;
}

export function formatGitHubAnnotations(records: DiagnosticRecord[]): string {
  const lines: string[] = [];
  for (const r of records) {
    const msg = truncateMessage(r.message);
    if (r.severity === "critical" || r.severity === "error") {
      lines.push(`::error file=${r.file}::${msg}`);
    } else if (r.severity === "warning") {
      lines.push(`::warning file=${r.file}::${msg}`);
    } else if (r.severity === "notice") {
      lines.push(`::notice file=${r.file}::${msg}`);
    }
    // info → no annotation
  }
  return lines.join("\n");
}
