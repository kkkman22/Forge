import { afterEach, describe, expect, it } from "vitest";
import { __resetForTest, hasCapability, loadCapabilities, } from "../../scripts/cmux-mirror/lib/capabilities.mjs";
import { createMockSocket } from "./mock-socket";
let mock = null;
afterEach(async () => {
    __resetForTest();
    if (mock) {
        await mock.close();
        mock = null;
    }
});
describe("capabilities: full response", () => {
    it("parses capabilities from cmux capabilities --json", async () => {
        mock = await createMockSocket();
        const orig = { ...process.env };
        process.env.CMUX_SOCKET_PATH = mock.socketPath;
        process.env.CMUX_WORKSPACE_ID = "workspace:1";
        try {
            // The mock socket responds to system.capabilities with all supported methods
            const caps = await loadCapabilities("/bin/echo");
            expect(caps).toBeDefined();
        }
        finally {
            process.env = orig;
        }
    });
});
describe("capabilities: hasCapability (R13.5)", () => {
    it("returns true for available capability", async () => {
        __resetForTest();
        // Simulate a cached capability list
        const { __setCapabilitiesForTest } = await import("../../scripts/cmux-mirror/lib/capabilities.mjs");
        __setCapabilitiesForTest(["set_status", "set_progress", "log"]);
        expect(hasCapability("set-progress")).toBe(true);
        expect(hasCapability("notify")).toBe(false);
    });
    it("returns false for missing capability", async () => {
        __resetForTest();
        const { __setCapabilitiesForTest } = await import("../../scripts/cmux-mirror/lib/capabilities.mjs");
        __setCapabilitiesForTest(["set_status", "log"]);
        expect(hasCapability("set-progress")).toBe(false);
    });
    it("returns false when no capabilities loaded (timeout/failure)", async () => {
        __resetForTest();
        const { __setCapabilitiesForTest } = await import("../../scripts/cmux-mirror/lib/capabilities.mjs");
        __setCapabilitiesForTest([]);
        expect(hasCapability("set-progress")).toBe(false);
    });
});
//# sourceMappingURL=capabilities.test.js.map