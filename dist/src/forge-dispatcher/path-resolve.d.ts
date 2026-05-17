interface PathOk {
    ok: true;
    path: string;
}
interface PathErr {
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
export {};
