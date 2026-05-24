export interface AcceptanceCriterion {
    id: string;
    text: string;
    verifyBy: string;
    evidence: string;
}
export interface ContractValidationError {
    acId: string;
    field: "Verify-By" | "Evidence";
    reason: string;
}
export interface ContractValidationResult {
    valid: boolean;
    errors: string[];
    legacySkipped?: boolean;
}
export declare function extractAcceptanceCriteria(specMarkdown: string): AcceptanceCriterion[];
export declare function validateContract(specMarkdown: string): ContractValidationResult;
