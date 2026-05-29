export interface PathOk {
    ok: true;
    path: string;
}
export interface PathErr {
    ok: false;
    code: "E_PATH_INVALID";
    reason: string;
}
export type PathResolveResult = PathOk | PathErr;
export interface PathResolveOpts {
    pluginRoot?: string;
    cwd?: string;
}
export declare function resolveLibPath(sub: string, opts?: PathResolveOpts): PathResolveResult;
