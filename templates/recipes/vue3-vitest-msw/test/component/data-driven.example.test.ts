// L4 data-driven branch test (ADR-0006 Req6 AC7) — THE core teaching file.
//
// Demonstrates the pattern that dissolves the combinatorial explosion: the same
// component × multiple API data states → different UI branches, matrixed with
// describe.each + MSW injection. This is how a 5 roles × 8 screens matrix moves
// from 40 E2E scenarios to 40 millisecond component cases.
//
// Extend the `cases` array to cover more roles/states as your app grows.
import { describe, expect, it } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { server } from "../../msw/server";
import { http, HttpResponse } from "msw";

// Stub component: renders a delete button only when role === "admin".
// Replace with your real component; keep the role-driven branch assertion.
const RolePanel = {
  template: `
    <div>
      <button v-if="role === 'admin'" role="button" data-test="delete">删除</button>
      <p role="status">{{ role || "loading" }}</p>
    </div>
  `,
  data: () => ({ role: "" }),
  async mounted() {
    const res = await fetch("/api/user");
    const json = await res.json();
    this.role = json.data.role;
  },
};

// ★ Matrix: same component × multiple interface-data states → different UI branches
const cases = [
  { role: "admin", deleteVisible: true, desc: "admin 能看到删除按钮" },
  { role: "viewer", deleteVisible: false, desc: "viewer 看不到删除按钮" },
] as const;

describe.each(cases)("RolePanel 当 role=$role", ({ role, deleteVisible, desc }) => {
  it(desc, async () => {
    // MSW injects the corresponding API response for this data state
    server.use(
      http.get("/api/user", () =>
        HttpResponse.json({ code: 1000, data: { role } }),
      ),
    );
    const wrapper = mount(RolePanel);
    await flushPromises();

    // semantic query (role/data-test, never CSS class — AC5)
    const deleteBtn = wrapper.find('[data-test="delete"]');
    expect(deleteBtn.exists()).toBe(deleteVisible);
  });
});
