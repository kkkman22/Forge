/**
 * Fix checklist — track P0/P1 findings through the review-fix-ship cycle.
 *
 * **Validates: Requirements 10.1–10.5**
 */
/** @public */
export type ChecklistStatus = "unfixed" | "in-progress" | "fixed" | "verified";
/** @public */
export interface ChecklistEntry {
    findingId: string;
    severity: "P0" | "P1";
    filePath: string;
    lineNumber: number;
    description: string;
    status: ChecklistStatus;
    fixCommit?: string;
}
/** @public */
export declare const VALID_TRANSITIONS: Record<ChecklistStatus, ChecklistStatus[]>;
/** @public */
export declare function isValidTransition(current: ChecklistStatus, next: ChecklistStatus): boolean;
/** @public */
export declare function createChecklist(findings: Array<{
    severity: string;
    filePath: string;
    lineNumber: number;
    description: string;
}>): ChecklistEntry[];
/** @public */
export declare function updateEntryStatus(entry: ChecklistEntry, newStatus: ChecklistStatus, fixCommit?: string): {
    success: boolean;
    entry: ChecklistEntry;
    error?: string;
};
/** @public */
export declare function allEntriesVerified(entries: ChecklistEntry[]): boolean;
/** @public */
export declare function serializeChecklist(entries: ChecklistEntry[], topic: string, createdAt?: string): string;
/** @public */
export declare function parseChecklist(content: string): ChecklistEntry[];
