export function makeDiagnosticFactory(scriptName) {
    return function makeDiagnostic(file, severity, message, extra) {
        return {
            script: scriptName,
            severity,
            file,
            message,
            ...(extra ? { extra } : {}),
        };
    };
}
//# sourceMappingURL=diagnostic-helper.js.map