export type TemplateValue = string | string[] | Record<string, unknown> | Array<Record<string, unknown>>;
export interface TemplateContext {
    [placeholder: string]: TemplateValue;
}
export interface TemplateRenderResult {
    content: string;
    unresolvedPlaceholders: string[];
    outputSuggestedPath: string;
}
export declare function renderTemplate(template: string, context: TemplateContext): TemplateRenderResult;
