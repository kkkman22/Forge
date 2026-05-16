export interface CommandEntry {
    cmd: string;
    exit_code: number;
}
export interface HandoffBlock {
    task_id: string;
    completed: string[];
    not_completed: string[];
    commands_executed: CommandEntry[];
    issues_found: string[];
    procedure_compliance: string;
}
export interface HandoffValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function parseHandoffBlock(block: string): HandoffBlock;
export declare function validateHandoff(handoff: HandoffBlock, options?: {
    tier?: "light" | "standard" | "full";
}): HandoffValidationResult;
export declare function serializeHandoff(handoff: HandoffBlock): string;
