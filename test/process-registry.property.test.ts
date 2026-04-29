import { describe, it, expect, beforeEach } from "vitest";
import { ProcessRegistry } from "../src/process-registry.js";

beforeEach(() => {
	ProcessRegistry.resetInstance();
});

describe("ProcessRegistry", () => {
	describe("singleton", () => {
		it("getInstance returns same instance", () => {
			const a = ProcessRegistry.getInstance();
			const b = ProcessRegistry.getInstance();
			expect(a).toBe(b);
		});

		it("resetInstance creates new instance", () => {
			const first = ProcessRegistry.getInstance();
			ProcessRegistry.resetInstance();
			const second = ProcessRegistry.getInstance();
			expect(first).not.toBe(second);
		});
	});

	describe("register/unregister/getAll/size", () => {
		it("register adds child and getAll returns it", () => {
			const reg = ProcessRegistry.getInstance();
			const child = { pid: 12345, on: () => {} } as any;
			reg.register(child, { source: "test", detached: false });

			expect(reg.size()).toBe(1);
			const all = reg.getAll();
			expect(all).toHaveLength(1);
			expect(all[0].pid).toBe(12345);
			expect(all[0].source).toBe("test");
			expect(all[0].detached).toBe(false);
			expect(all[0].pgid).toBeDefined();
			expect(all[0].startTime).toBeTypeOf("number");
		});

		it("unregister removes by pid", () => {
			const reg = ProcessRegistry.getInstance();
			const child = { pid: 999, on: () => {} } as any;
			reg.register(child, { source: "test", detached: false });
			expect(reg.size()).toBe(1);

			reg.unregister(999);
			expect(reg.size()).toBe(0);
			expect(reg.getAll()).toHaveLength(0);
		});

		it("exit event auto-unregisters", () => {
			const reg = ProcessRegistry.getInstance();
			const listeners: Record<string, Function[]> = {};
			const child = {
				pid: 777,
				on: (event: string, fn: Function) => {
					listeners[event] = listeners[event] || [];
					listeners[event].push(fn);
				},
			} as any;

			reg.register(child, { source: "test", detached: false });
			expect(reg.size()).toBe(1);

			for (const fn of listeners["exit"] || []) {
				fn(0, null);
			}
			expect(reg.size()).toBe(0);
		});

		it("register with description stores it", () => {
			const reg = ProcessRegistry.getInstance();
			const child = { pid: 555, on: () => {} } as any;
			reg.register(child, {
				source: "sleep-prevention",
				detached: false,
				description: "caffeinate -i -w 1234",
			});

			const all = reg.getAll();
			expect(all[0].description).toBe("caffeinate -i -w 1234");
		});
	});
});
