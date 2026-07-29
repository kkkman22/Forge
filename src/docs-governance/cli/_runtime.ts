import { severityToExitCode } from "../reporter/exit-code.js";
import type { DiagnosticRecord } from "../types.js";
import { ExitCode } from "../types.js";

export interface ExitResult {
  exitCode: number;
  diagnostics: DiagnosticRecord[];
  error?: Error;
}

export function computeExitResult(main: () => DiagnosticRecord[]): ExitResult {
  let diagnostics: DiagnosticRecord[] = [];
  try {
    diagnostics = main();
  } catch (err) {
    return {
      exitCode: ExitCode.INTERNAL, // 3 — overrides any severity
      diagnostics,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
  return {
    exitCode: severityToExitCode(diagnostics),
    diagnostics,
  };
}
