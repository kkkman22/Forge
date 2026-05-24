import type { DiagnosticRecord, ExitCode, Severity } from "../types.js";
import { ExitCode as EC } from "../types.js";

const SEVERITY_TO_EXIT: Record<Severity, ExitCode> = {
  critical: EC.CRITICAL,
  error: EC.ERROR,
  warning: EC.OK,
  notice: EC.OK,
  info: EC.OK,
};

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  notice: 1,
  info: 0,
};

export function severityToExitCode(records: readonly DiagnosticRecord[]): ExitCode {
  if (records.length === 0) return EC.OK;
  let maxRank = 0;
  let maxSeverity: Severity = "info";
  for (const r of records) {
    const rank = SEVERITY_RANK[r.severity];
    if (rank > maxRank) {
      maxRank = rank;
      maxSeverity = r.severity;
    }
  }
  return SEVERITY_TO_EXIT[maxSeverity];
}
