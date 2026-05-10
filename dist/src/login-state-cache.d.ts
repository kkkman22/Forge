export declare function getCachedStatePath(projectName: string): string;
export declare function isStateCacheExpired(cookies: readonly {
    expires?: number;
}[], expirySafetyDays?: number): boolean;
export declare function promptForManualLogin(surfaceId: string): string;
