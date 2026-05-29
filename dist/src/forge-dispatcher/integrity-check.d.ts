export type IntegrityResult = {
    ok: true;
} | {
    ok: false;
    code: "E_MANIFEST_MISSING" | "E_INTEGRITY_MISMATCH";
};
export interface IntegrityOpts {
    manifestPath?: string;
}
export declare function checkIntegrity(libPath: string, opts?: IntegrityOpts): IntegrityResult;
