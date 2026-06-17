import { describe, expect, it } from "vitest";
import { isUrlAllowed, redactSnapshot } from "../src/accept-security.js";

// Verifies spec R4-AC4 (redaction) and R4-AC5 (url allowlist).
// T1.3 RED → GREEN

describe("redactSnapshot", () => {
  it("redacts Set-Cookie header", () => {
    expect(redactSnapshot("Set-Cookie: token=abc")).toBe("Set-Cookie: [REDACTED]");
  });

  it("redacts Authorization header", () => {
    expect(redactSnapshot("Authorization: Bearer xyz")).toBe("Authorization: [REDACTED]");
  });

  it("redacts password field", () => {
    expect(redactSnapshot("password=admin123")).toBe("password=[REDACTED]");
  });

  it("redacts token/bearer keywords", () => {
    expect(redactSnapshot("access_token=eyJ...")).toBe("access_token=[REDACTED]");
    expect(redactSnapshot("bearer xyz123")).toBe("bearer [REDACTED]");
  });

  it("redacts multiple secrets in one text", () => {
    const out = redactSnapshot("Set-Cookie: s=1\nAuthorization: Bearer t\npassword=pw");
    expect(out).toBe("Set-Cookie: [REDACTED]\nAuthorization: [REDACTED]\npassword=[REDACTED]");
  });

  it("leaves non-sensitive text intact", () => {
    expect(redactSnapshot("欢迎 admin 登录成功")).toBe("欢迎 admin 登录成功");
  });

  it("is idempotent", () => {
    const once = redactSnapshot("password=secret");
    expect(redactSnapshot(once)).toBe(once);
  });
});

describe("isUrlAllowed", () => {
  const allowlist = ["localhost", "127.0.0.1"];

  it("allows localhost", () => {
    expect(isUrlAllowed("http://localhost:5173/login", allowlist)).toBe(true);
  });

  it("allows 127.0.0.1", () => {
    expect(isUrlAllowed("http://127.0.0.1:3000", allowlist)).toBe(true);
  });

  it("blocks private network IP", () => {
    expect(isUrlAllowed("http://192.168.1.1/admin", allowlist)).toBe(false);
  });

  it("blocks external domain", () => {
    expect(isUrlAllowed("https://evil.example.com", allowlist)).toBe(false);
  });

  it("blocks .local mDNS", () => {
    expect(isUrlAllowed("http://host.local:8080", allowlist)).toBe(false);
  });

  it("allows an explicitly declared dev domain", () => {
    expect(isUrlAllowed("http://myapp.test:4000", ["localhost", "127.0.0.1", "myapp.test"])).toBe(
      true,
    );
  });

  it("rejects malformed url", () => {
    expect(isUrlAllowed("not-a-url", allowlist)).toBe(false);
  });
});

describe("redactSnapshot — JWT/PEM/x-api-key (P1-C)", () => {
  it("redacts JWT tokens (eyJ marker)", () => {
    const out = redactSnapshot("token eyJhbGci.eyJzdWIi.SflKxwRJSMeKKF2QT4f");
    expect(out).toContain("[REDACTED-JWT]");
    expect(out).not.toContain("eyJhbGci");
  });
  it("redacts PEM private key blocks", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK\n-----END RSA PRIVATE KEY-----";
    const out = redactSnapshot(pem);
    expect(out).toContain("[REDACTED-PEM]");
    expect(out).not.toContain("MIIEpAIBAAK");
  });
  it("redacts x-api-key / sessionid headers", () => {
    expect(redactSnapshot("x-api-key: abc123secret")).toMatch(/x-api-key.*REDACTED/);
    expect(redactSnapshot("sessionid: sid_xyz")).toContain("[REDACTED]");
  });
});
