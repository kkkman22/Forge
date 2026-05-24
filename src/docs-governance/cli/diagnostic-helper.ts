import type { DiagnosticRecord, DocPath, Severity } from "../types.js";

export function makeDiagnosticFactory(scriptName: string) {
  return function makeDiagnostic(
    file: DocPath,
    severity: Severity,
    message: string,
    extra?: Record<string, string | number | boolean>,
  ): DiagnosticRecord {
    return {
      script: scriptName,
      severity,
      file,
      message,
      ...(extra ? { extra } : {}),
    };
  };
}
