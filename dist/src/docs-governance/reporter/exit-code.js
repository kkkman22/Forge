import { ExitCode as EC } from "../types.js";
const SEVERITY_TO_EXIT = {
    critical: EC.CRITICAL,
    error: EC.ERROR,
    warning: EC.OK,
    notice: EC.OK,
    info: EC.OK,
};
const SEVERITY_RANK = {
    critical: 4,
    error: 3,
    warning: 2,
    notice: 1,
    info: 0,
};
export function severityToExitCode(records) {
    if (records.length === 0)
        return EC.OK;
    let maxRank = 0;
    let maxSeverity = "info";
    for (const r of records) {
        const rank = SEVERITY_RANK[r.severity];
        if (rank > maxRank) {
            maxRank = rank;
            maxSeverity = r.severity;
        }
    }
    return SEVERITY_TO_EXIT[maxSeverity];
}
//# sourceMappingURL=exit-code.js.map