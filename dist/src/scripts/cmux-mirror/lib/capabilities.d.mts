/**
 * Load capabilities from cmux CLI. Caches result for process lifetime (R13.5).
 */
export function loadCapabilities(cmuxBin?: string): Promise<any>;
/**
 * Check if a capability is available (R13.5).
 * Maps from user-facing names to cmux method names.
 */
export function hasCapability(name: any): any;
export function __resetForTest(): void;
export function __setCapabilitiesForTest(methods: any): void;
