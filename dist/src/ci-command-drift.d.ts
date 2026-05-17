export type DriftResult = {
    kind: "has_ci_command";
    command: string;
} | {
    kind: "drift_with_npm_check";
    suggestedCommand: "npm run check";
    warning: string;
} | {
    kind: "no_check_no_field";
} | {
    kind: "malformed_package_json";
    reason: string;
};
export interface FrontmatterInput {
    ci_check_command?: string;
}
export declare function detectCiCommandDrift(frontmatter: FrontmatterInput, packageJsonRaw: string | null): DriftResult;
