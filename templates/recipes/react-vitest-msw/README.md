# react-vitest-msw recipe

Component-layer (ADR-0006 Layer 3) test scaffold for **React + Vite + Vitest + MSW**.
This recipe generates files into YOUR project — Forge installs nothing (R6.5).

## 1. Install the dependencies yourself

Forge does not auto-install. Run the command it printed (detected from your
lockfile / `packageManager`):

```bash
pnpm add -D msw vitest @testing-library/react @testing-library/user-event jsdom @vitest/coverage-v8 @vitejs/plugin-react
# or: npm install -D ... / yarn add -D ...
```

Then init the MSW service worker (for browser/E2E use only — component tests
don't need it):

```bash
pnpm msw init public/ --save
```

## 2. What was generated

```
vitest.config.ts               jsdom env + setupFiles
msw/handlers.ts                ★ single handler registry (server + worker)
msw/server.ts                  setupServer — component tests (Node)
msw/browser.ts                 setupWorker — your Playwright E2E (browser)
test/setup.ts                  listen / reset / close lifecycle
test/component/interaction.example.test.tsx    L3 interaction assertion
test/component/data-driven.example.test.tsx    ★ L4 data-driven branch matrix
package.devDeps.snippet        the devDeps to add (text, not auto-parsed)
```

## 3. Test philosophy: test behavior, not implementation (Req6 AC5)

- **DO** use `@testing-library` semantic queries: `getByRole('button')`,
  `getByText`, `getByLabelText`, `queryByRole`. These mirror how users
  interact and survive refactors.
- **DON'T** query by fragile implementation detail: `container.querySelector`,
  CSS classes, DOM structure. These break on refactor without a real regression.

## 4. Handler reuse boundaries (Req6 AC8 — be honest)

The `msw/handlers.ts` registry is shared so you write mock responses once:

| Consumer | Reuses handlers? | Why |
|----------|------------------|-----|
| Component tests (`setupServer`, Node) | ✅ | MSW intercepts at the Node http layer |
| **Your** Playwright E2E (`setupWorker`, after registering `mockServiceWorker.js`) | ✅ | worker intercepts in the browser once registered |
| **Forge's `agentBrowserRunner` E2E** | ❌ | it drives a REAL dev server, no MSW worker |

## 5. The core pattern: data-driven branches (Req6 AC7)

`test/component/data-driven.example.test.tsx` is the **most important file**.
It shows how to move the combinatorial explosion (N roles × M screens) out of
slow E2E into millisecond component tests:

```tsx
const cases = [
  { role: "admin", deleteVisible: true },
  { role: "viewer", deleteVisible: false },
];
describe.each(cases)("RolePanel 当 role=$role", ({ role, deleteVisible }) => {
  server.use(http.get("/api/user", () => HttpResponse.json({ data: { role } })));
  // render → queryByRole → assert the UI branch for this data state
});
```

## 6. Custom request-layer adaptation (Req6 AC14)

If your project's axios/fetch wrapper has non-standard processing (response-body
encryption/decryption, business-code interception/routing), a standard MSW
handler may mock green locally but fail against the real backend. Two strategies:

**Strategy A — handler returns the post-wrapper data shape:**
```ts
http.get("/api/user", () =>
  HttpResponse.json({ code: 1000, data: { role: "admin" } }), // already-routed
);
```

**Strategy B — short-circuit the wrapper with vi.mock:**
```ts
vi.mock("@/utils/http", () => ({
  request: vi.fn(() => Promise.resolve({ data: { role: "admin" } })), // skip decrypt
}));
```

The wrapper chain itself should be covered by the project's unit tests.

## 7. Add to package.json scripts

```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:component": "vitest run"
  }
}
```

Forge's delegate runners (ADR-0006 Req3) invoke `test:component` when an AC's
`Verify-By: vitest:component`. Without this script, the delegate returns
`INCONCLUSIVE` with a pointer back here.
