// L3 interaction test (ADR-0006 Req6 AC6) — assert on USER INTERACTION, not
// just static render. Queries use semantic roles (getByRole), never fragile
// DOM selectors (querySelector / CSS class) — "test behavior, not implementation".
//
// This is a TEMPLATE example. Replace RolePanel with your component and adjust
// the assertion to your real UI contract.
import { describe, expect, it } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { server } from "../../msw/server";
import { http, HttpResponse } from "msw";

// Minimal stub component showing the pattern. Swap for your real component.
const RolePanel = {
  template: `
    <div>
      <button role="button" data-test="refresh" @click="load">刷新</button>
      <p role="status">{{ role || "loading" }}</p>
    </div>
  `,
  data: () => ({ role: "" }),
  async mounted() {
    const res = await fetch("/api/user");
    const json = await res.json();
    this.role = json.data.role;
  },
  methods: {
    async load() {
      const res = await fetch("/api/user");
      const json = await res.json();
      this.role = json.data.role;
    },
  },
};

describe("RolePanel — interaction (L3)", () => {
  it("clicking refresh re-fetches and updates the role text", async () => {
    server.use(
      http.get("/api/user", () =>
        HttpResponse.json({ code: 1000, data: { role: "admin" } }),
      ),
    );
    const wrapper = mount(RolePanel);
    await flushPromises();

    // semantic query: find by role, not by CSS class
    const status = wrapper.find('[role="status"]');
    expect(status.text()).toBe("admin");

    // user interaction: click the refresh button, assert the UI reacts
    server.use(
      http.get("/api/user", () =>
        HttpResponse.json({ code: 1000, data: { role: "viewer" } }),
      ),
    );
    await wrapper.find('[role="button"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).toBe("viewer");
  });
});
