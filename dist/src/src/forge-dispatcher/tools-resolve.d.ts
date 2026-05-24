export interface ToolsOk {
    ok: true;
    tools: string[];
}
export interface ToolsErr {
    ok: false;
    code: "E_TOOLS_UNDECLARED";
}
export type ToolsResolveResult = ToolsOk | ToolsErr;
export declare function resolveAllowedTools(libContent: string): ToolsResolveResult;
