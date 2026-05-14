export type DeliverableCategory = "decision" | "execution" | "delivery" | "diagnostic" | "query" | "other";
export declare const DELIVERABLE_FIELD_MAP: Record<DeliverableCategory, readonly string[]>;
export interface SkeletonCheck {
    filePath?: string;
    hasPrerequisites: boolean;
    hasWorkflow: boolean;
    hasDeliverable: boolean;
    deliverableExempt: boolean;
    legacyExempt: boolean;
    valid: boolean;
    errors: string[];
}
export declare function parseSkeleton(content: string): SkeletonCheck;
export declare function renderSkeletonReport(checks: SkeletonCheck[]): string;
