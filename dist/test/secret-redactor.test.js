/**
 * Tests for secret-redactor.ts — 4 leak patterns.
 *
 * Covers [R12.11]:
 *   (a) Bearer token in Authorization header
 *   (b) JSON "token" field
 *   (c) Environment variable assignment
 *   (d) Custom auth header values
 *
 * Each pattern has ≥ 5 test cases.
 */
import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/secret-redactor.js";
// ---------------------------------------------------------------------------
// Pattern (a): Bearer / Basic token in Authorization header
// ---------------------------------------------------------------------------
describe("secret-redactor: Authorization header (Bearer/Basic)", () => {
    it("redacts Bearer token", () => {
        expect(redactSecrets("Authorization: Bearer abc123def456")).toBe("Authorization: Bearer ***");
    });
    it("redacts Bearer with long token", () => {
        const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";
        expect(redactSecrets(`Authorization: Bearer ${token}`)).toBe("Authorization: Bearer ***");
    });
    it("redacts Basic auth", () => {
        expect(redactSecrets("Authorization: Basic dXNlcjpwYXNz")).toBe("Authorization: Basic ***");
    });
    it("redacts lowercase authorization", () => {
        expect(redactSecrets("authorization: bearer my-secret-token")).toBe("authorization: bearer ***");
    });
    it("redacts in JSON context", () => {
        const input = '{"auth": "Bearer token123"}';
        const result = redactSecrets(input);
        expect(result).not.toContain("token123");
        expect(result).toContain("***");
    });
});
// ---------------------------------------------------------------------------
// Pattern (b): JSON "token" field
// ---------------------------------------------------------------------------
describe("secret-redactor: JSON token field", () => {
    it("redacts JSON token field with double quotes", () => {
        expect(redactSecrets('{"token": "secret123"}')).toBe('{"token": "***"}');
    });
    it('redacts JSON "access_token" field', () => {
        expect(redactSecrets('{"access_token": "abc.def.ghi"}')).toBe('{"access_token": "***"}');
    });
    it('redacts JSON "refresh_token" field', () => {
        expect(redactSecrets('{"refresh_token": "rf_12345"}')).toBe('{"refresh_token": "***"}');
    });
    it("redacts multiple token fields", () => {
        const input = '{"token": "t1", "access_token": "t2"}';
        const result = redactSecrets(input);
        expect(result).not.toContain("t1");
        expect(result).not.toContain("t2");
    });
    it("does not redact non-token string fields", () => {
        expect(redactSecrets('{"name": "my-secret-name"}')).toBe('{"name": "my-secret-name"}');
    });
});
// ---------------------------------------------------------------------------
// Pattern (c): Environment variable assignment
// ---------------------------------------------------------------------------
describe("secret-redactor: Environment variable assignment", () => {
    it("redacts export with secret in name", () => {
        expect(redactSecrets("export SECRET_KEY=abc123")).toBe("export SECRET_KEY=***");
    });
    it("redacts API_KEY assignment", () => {
        expect(redactSecrets("API_KEY=my-api-key-123")).toBe("API_KEY=***");
    });
    it("redacts PRIVATE_KEY assignment", () => {
        expect(redactSecrets('PRIVATE_KEY="-----BEGIN RSA-----"')).toBe("PRIVATE_KEY=***");
    });
    it("redacts DATABASE_URL with password", () => {
        expect(redactSecrets("DATABASE_URL=postgres://user:secretpass@host/db")).toBe("DATABASE_URL=***");
    });
    it("redacts token env var", () => {
        expect(redactSecrets("AUTH_TOKEN=bearer-xyz-789")).toBe("AUTH_TOKEN=***");
    });
});
// ---------------------------------------------------------------------------
// Pattern (d): Custom auth header values
// ---------------------------------------------------------------------------
describe("secret-redactor: Custom auth header values", () => {
    it("redacts X-API-Key header", () => {
        expect(redactSecrets("X-API-Key: my-api-key-123")).toBe("X-API-Key: ***");
    });
    it("redacts X-Auth-Token header", () => {
        expect(redactSecrets("X-Auth-Token: auth-token-456")).toBe("X-Auth-Token: ***");
    });
    it("redacts Api-Key header", () => {
        expect(redactSecrets("Api-Key: key-789")).toBe("Api-Key: ***");
    });
    it("redacts in HTTP request context", () => {
        const input = "GET /api HTTP/1.1\nX-API-Key: secret-key";
        const result = redactSecrets(input);
        expect(result).not.toContain("secret-key");
    });
    it("does not redact non-auth headers", () => {
        expect(redactSecrets("Content-Type: application/json")).toBe("Content-Type: application/json");
    });
});
// ---------------------------------------------------------------------------
// Combined / edge cases
// ---------------------------------------------------------------------------
describe("secret-redactor: combined and edge cases", () => {
    it("handles empty string", () => {
        expect(redactSecrets("")).toBe("");
    });
    it("handles string with no secrets", () => {
        const input = "Hello world, this is a normal log message";
        expect(redactSecrets(input)).toBe(input);
    });
    it("handles multiple secrets in one string", () => {
        const input = 'Bearer token123 {"token": "abc"} export KEY=val X-API-Key: key';
        const result = redactSecrets(input);
        expect(result).not.toContain("token123");
        expect(result).not.toContain('"abc"');
        expect(result).not.toContain("val");
        expect(result).not.toContain(": key");
    });
});
//# sourceMappingURL=secret-redactor.test.js.map