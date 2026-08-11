import { describe, expect, it } from "vitest";
import { shouldRunCmuxDoctor } from "../../scripts/bootstrap-check.mjs";

describe("shouldRunCmuxDoctor", () => {
  it("returns no_cmux_json when cmux.json does not exist", () => {
    const env = { cwd: "/project" };
    const fsExists = (_path: string) => false;
    const result = shouldRunCmuxDoctor(env, fsExists);
    expect(result).toEqual({ run: false, reason: "no_cmux_json" });
  });

  it("returns run: true when cmux.json exists and dismiss file does not", () => {
    const env = { cwd: "/project" };
    const fsExists = (path: string) => path === "/project/cmux.json";
    const result = shouldRunCmuxDoctor(env, fsExists);
    expect(result).toEqual({ run: true });
  });

  it("returns user_dismissed when both cmux.json and dismiss file exist", () => {
    const env = { cwd: "/project" };
    const fsExists = (path: string) =>
      path === "/project/cmux.json" || path === "/project/.tinkerman/.bootstrap-doctor-dismissed";
    const result = shouldRunCmuxDoctor(env, fsExists);
    expect(result).toEqual({ run: false, reason: "user_dismissed" });
  });
});
