// L3 interaction test (ADR-0006 Req6 AC6) — assert on USER INTERACTION.
// Uses @testing-library semantic queries (getByRole), never querySelector/CSS.
//
// This is a TEMPLATE example. Replace RolePanel with your component.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "../../msw/server";
import { http, HttpResponse } from "msw";
import { useEffect, useState } from "react";

// Stub component showing the pattern. Swap for your real component.
function RolePanel() {
  const [role, setRole] = useState("");
  useEffect(() => {
    fetch("/api/user")
      .then((r) => r.json())
      .then((j) => setRole(j.data.role));
  }, []);
  return (
    <div>
      <button role="button" onClick={async () => {
        const r = await fetch("/api/user");
        const j = await r.json();
        setRole(j.data.role);
      }}>刷新</button>
      <p role="status">{role || "loading"}</p>
    </div>
  );
}

describe("RolePanel — interaction (L3)", () => {
  it("clicking refresh re-fetches and updates the role text", async () => {
    server.use(
      http.get("/api/user", () =>
        HttpResponse.json({ code: 1000, data: { role: "admin" } }),
      ),
    );
    render(<RolePanel />);
    // semantic query by role
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("admin"));

    // user interaction via userEvent (semantic), then assert UI reacts
    server.use(
      http.get("/api/user", () =>
        HttpResponse.json({ code: 1000, data: { role: "viewer" } }),
      ),
    );
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("viewer"));
  });
});
