import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentBrowserCliClient } from "../../src/agent-browser-client.js";
// @smoke — REAL end-to-end acceptance against agent-browser + a local fixture.
// Runs ONLY when agent-browser is installed; otherwise skips (no CI failure).
// Verified contract: --session global flag, snapshot -i --json, @refs, fill value in argv.
function agentBrowserAvailable() {
    try {
        execFileSync("which", ["agent-browser"], { encoding: "utf-8", timeout: 3000 });
        return true;
    }
    catch {
        return false;
    }
}
const hasAgentBrowser = agentBrowserAvailable();
let server;
let baseUrl = "";
const LOGIN_HTML = `<!DOCTYPE html><html><head><title>Login</title></head>
<body><h1>Login</h1>
<form id="f" action="/welcome.html">
  <input id="user" placeholder="username" autocomplete="off">
  <input id="pass" type="password" placeholder="password" autocomplete="off">
  <button type="submit">Sign In</button>
</form></body></html>`;
const WELCOME_HTML = "<!DOCTYPE html><html><head><title>Dashboard</title></head><body><h1>Welcome admin</h1></body></html>";
beforeAll(async () => {
    if (!hasAgentBrowser)
        return;
    server = createServer((req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        if (req.url?.startsWith("/welcome")) {
            res.end(WELCOME_HTML);
        }
        else {
            res.end(LOGIN_HTML);
        }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    if (addr && typeof addr === "object")
        baseUrl = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => {
    if (server)
        await new Promise((r) => server.close(() => r()));
});
describe.skipIf(!hasAgentBrowser)("@smoke real agent-browser login acceptance", () => {
    it("open→fill→click→resnapshot yields PASS (jump to welcome + Welcome admin)", async () => {
        const c = new AgentBrowserCliClient();
        const sid = `smoke-${Date.now()}`;
        try {
            await c.open(`${baseUrl}/login.html`, sid);
            const s1 = await c.snapshot(sid);
            expect(s1.refs.some((r) => r.role === "button")).toBe(true);
            const userInput = s1.refs.find((r) => r.role === "textbox");
            expect(userInput).toBeDefined();
            await c.fill(sid, userInput.ref, "admin");
            const btn = s1.refs.find((r) => r.role === "button");
            await c.click(sid, btn.ref);
            // allow navigation
            await new Promise((r) => setTimeout(r, 1500));
            const s2 = await c.snapshot(sid);
            const jumped = s2.url.includes("welcome");
            const showed = s2.text.includes("Welcome admin");
            expect(jumped && showed).toBe(true);
        }
        finally {
            try {
                await c.close(sid);
            }
            catch {
                // best effort
            }
        }
    }, 30_000);
});
describe("@smoke availability probe", () => {
    it("reports agent-browser availability", () => {
        expect(typeof hasAgentBrowser).toBe("boolean");
    });
});
//# sourceMappingURL=accept-login.smoke.test.js.map