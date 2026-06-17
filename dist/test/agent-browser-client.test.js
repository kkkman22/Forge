import { describe, expect, it } from "vitest";
import { FakeAgentBrowserClient, } from "../src/agent-browser-client.js";
// Verifies spec R1-AC3 (interface shape), NFR-3 (test boundary).
// T2.1 RED → GREEN
describe("AgentBrowserClient interface + FakeAgentBrowserClient", () => {
    it("Fake.open resolves without throwing", async () => {
        const c = new FakeAgentBrowserClient();
        await expect(c.open("http://localhost:5173", "s1")).resolves.toBeUndefined();
    });
    it("Fake.snapshot returns refs with deterministic shape", async () => {
        const c = new FakeAgentBrowserClient();
        await c.open("http://localhost:5173/login", "s1");
        const snap = await c.snapshot("s1");
        expect(snap.refs).toBeInstanceOf(Array);
        expect(snap.refs.length).toBeGreaterThan(0);
        const ref = snap.refs[0];
        expect(ref.ref).toMatch(/^e\d+$/);
        expect(typeof ref.tag).toBe("string");
        expect(typeof ref.text).toBe("string");
        expect(snap.url).toContain("localhost");
        expect(typeof snap.title).toBe("string");
        expect(typeof snap.text).toBe("string");
    });
    it("Fake.click / fill / screenshot / close resolve", async () => {
        const c = new FakeAgentBrowserClient();
        await c.open("http://localhost:5173", "s1");
        await expect(c.click("s1", "e1")).resolves.toBeUndefined();
        await expect(c.fill("s1", "e2", "value")).resolves.toBeUndefined();
        await expect(c.screenshot("s1", "/tmp/x.png")).resolves.toBeUndefined();
        await expect(c.close("s1")).resolves.toBeUndefined();
    });
    it("records call sequence for verification", async () => {
        const c = new FakeAgentBrowserClient();
        await c.open("http://localhost:5173", "s1");
        await c.snapshot("s1");
        await c.fill("s1", "e2", "admin");
        await c.click("s1", "e3");
        await c.close("s1");
        expect(c.calls.map((x) => x.method)).toEqual(["open", "snapshot", "fill", "click", "close"]);
    });
    it("Fake can be scripted to return a custom snapshot", async () => {
        const c = new FakeAgentBrowserClient();
        c.enqueueSnapshot({
            refs: [{ ref: "e3", tag: "button", text: "登录" }],
            url: "http://localhost:5173/login",
            title: "登录",
            text: "用户名 密码 登录",
        });
        await c.open("http://localhost:5173/login", "s1");
        const snap = await c.snapshot("s1");
        expect(snap.refs[0]).toMatchObject({ ref: "e3", text: "登录" });
    });
});
//# sourceMappingURL=agent-browser-client.test.js.map