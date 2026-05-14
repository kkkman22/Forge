export interface TemplateValidation {
    filePath: string;
    styleGuideVersion: string;
    missingSections: string[];
    valid: boolean;
    errors: string[];
}
export declare function validateSkillTemplate(filePath: string, content: string, requiredSections: readonly string[]): TemplateValidation;
