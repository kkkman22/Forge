import { describe, expect, it } from "vitest";
import { buildCurlArgs, extractActionKeyword } from "../src/accept-driver.js";
import {
  buildOpenArgs,
  parseSnapshotJson,
  validatePath,
  validateRef,
} from "../src/agent-browser-client.js";

// P3-5: direct unit tests for previously-untested pure functions.

describe("buildOpenArgs — reject branches (F11)", () => {
  it("rejects non-http url", () => {
    expect(() => buildOpenArgs("ftp://x", "s1")).toThrow(/invalid url/i);
    expect(() => buildOpenArgs("not-a-url", "s1")).toThrow(/invalid url/i);
  });
  it("rejects invalid sessionId", () => {
    expect(() => buildOpenArgs("http://x", "s 1")).toThrow(/invalid sessionId/i);
    expect(() => buildOpenArgs("http://x", "s;rm")).toThrow(/invalid sessionId/i);
  });
  it("accepts valid inputs", () => {
    const d = buildOpenArgs("https://example.com", "sess-1_2");
    expect(d.args).toEqual(["--session", "sess-1_2", "open", "https://example.com"]);
  });
});

describe("validateRef", () => {
  it("accepts eN format", () => {
    expect(() => validateRef("e1")).not.toThrow();
    expect(() => validateRef("e123")).not.toThrow();
  });
  it("rejects malformed refs", () => {
    expect(() => validateRef("@e1")).toThrow();
    expect(() => validateRef("e")).toThrow();
    expect(() => validateRef("1")).toThrow();
    expect(() => validateRef("evil; rm -rf")).toThrow();
  });
});

describe("validatePath", () => {
  it("accepts safe paths", () => {
    expect(() => validatePath("/tmp/out/screenshot.png")).not.toThrow();
    expect(() => validatePath("relative/file-name_1.png")).not.toThrow();
  });
  it("rejects path traversal", () => {
    expect(() => validatePath("../../etc/passwd")).toThrow();
    expect(() => validatePath("a/../../../b")).toThrow();
  });
  it("rejects shell metacharacters", () => {
    expect(() => validatePath("/tmp/a; rm -rf")).toThrow();
    expect(() => validatePath("/tmp/$(whoami)")).toThrow();
  });
});

describe("parseSnapshotJson — boundary cases", () => {
  it("parses the real envelope", () => {
    const snap = parseSnapshotJson(
      JSON.stringify({
        success: true,
        data: {
          origin: "http://x/y",
          refs: { e1: { name: "Btn", role: "button" } },
          snapshot: "text",
        },
      }),
    );
    expect(snap.url).toBe("http://x/y");
    expect(snap.refs[0]).toMatchObject({ ref: "e1", text: "Btn", role: "button" });
  });
  it("handles missing data gracefully", () => {
    const snap = parseSnapshotJson(JSON.stringify({ success: true }));
    expect(snap.url).toBe("");
    expect(snap.refs).toEqual([]);
  });
  it("handles empty refs object", () => {
    const snap = parseSnapshotJson(JSON.stringify({ success: true, data: { refs: {} } }));
    expect(snap.refs).toEqual([]);
  });
  it("throws on success:false", () => {
    expect(() => parseSnapshotJson(JSON.stringify({ success: false, error: "boom" }))).toThrow(
      /boom/,
    );
  });
});

describe("buildCurlArgs — url validation (F11)", () => {
  it("rejects non-http url", () => {
    expect(() => buildCurlArgs("GET", "ftp://x")).toThrow(/invalid url/i);
    expect(() => buildCurlArgs("GET", "localhost")).toThrow(/invalid url/i);
  });
  it("accepts valid http(s) url", () => {
    const d = buildCurlArgs("POST", "http://localhost:3000/api");
    expect(d.args).toContain("http://localhost:3000/api");
  });
  it("uppercases method, defaults odd method to GET", () => {
    expect(buildCurlArgs("post", "http://x").args).toContain("POST");
    expect(buildCurlArgs("weird;rm", "http://x").args).toContain("GET");
  });
});

describe("extractActionKeyword", () => {
  it("extracts button label after 点击/click", () => {
    expect(extractActionKeyword("点击 登录按钮")).toBe("登录");
    expect(extractActionKeyword("click Sign In")).toBe("Sign");
    expect(extractActionKeyword("tap 提交")).toBe("提交");
  });
  it("returns null when no action verb", () => {
    expect(extractActionKeyword("用户输入用户名")).toBeNull();
    expect(extractActionKeyword("")).toBeNull();
  });
});
