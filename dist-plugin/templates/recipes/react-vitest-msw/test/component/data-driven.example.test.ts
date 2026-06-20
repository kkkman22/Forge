// L4 data-driven branch test (ADR-0006 Req6 AC7) — THE core teaching file.
//
// Same component × multiple API data states → different UI branches, matrixed
// with it.each + MSW injection. This moves the combinatorial explosion from
// slow E2E into millisecond component tests.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { server } from "../../msw/server";
import { http, HttpResponse } from "msw";
import { useEffect, useState } from "react";

// Stub: renders a delete button only when role === "admin".
function RolePanel() {
  const [role, setRole] = useState("");
  useEffect(() => {
    fetch("/api/user")
      .then((r) => r.json())
      .then((j) => setRole(j.data.role));
  }, []);
  return (
    <div>
      {role === "admin" && <button role="button">删除</button>}
      <p role="status">{role || "loading"}</p>
    </div>
  );
}

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
    render(<RolePanel />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(role));

    // semantic query by role (never CSS class — AC5)
    const deleteBtn = screen.queryByRole("button", { name: /删除/ });
    expect(Boolean(deleteBtn)).toBe(deleteVisible);
  });
});
