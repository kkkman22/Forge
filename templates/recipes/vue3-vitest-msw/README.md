# vue3-vitest-msw recipe

Component-layer (ADR-0006 Layer 3) test scaffold for **Vue 3 + Vite + Vitest + MSW**.
This recipe generates files into YOUR project — Forge installs nothing (R6.5).

## 1. Install the dependencies yourself

Forge does not auto-install. Run the command it printed (detected from your
lockfile / `packageManager`):

```bash
pnpm add -D msw vitest @vue/test-utils jsdom @vitest/coverage-v8
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
test/component/interaction.example.test.ts    L3 interaction assertion
test/component/data-driven.example.test.ts    ★ L4 data-driven branch matrix
package.devDeps.snippet        the devDeps to add (text, not auto-parsed)
```

## 3. Test philosophy: test behavior, not implementation (Req6 AC5)

- **DO** query by semantic role / accessible name: `getByRole('button')`,
  `getByText`, `getByLabelText`, `[role="status"]`, `[data-test="..."]`.
- **DON'T** query by fragile implementation detail: `querySelector('#app .btn')`,
  CSS classes, DOM structure. These break on refactor without a real regression.

The example tests follow this. Keep it up as you add cases.

## 4. Handler reuse boundaries (Req6 AC8 — be honest)

The `msw/handlers.ts` registry is shared so you write mock responses once:

| Consumer | Reuses handlers? | Why |
|----------|------------------|-----|
| Component tests (`setupServer`, Node) | ✅ | MSW intercepts at the Node http layer — handler applies directly |
| **Your** Playwright E2E (`setupWorker`, after registering `mockServiceWorker.js`) | ✅ | worker intercepts in the browser once registered |
| **Forge's `agentBrowserRunner` E2E** | ❌ | it drives a REAL dev server and does not inject the MSW worker |

So: component tests + your own Playwright = reuse ✅. Forge's built-in acceptance
E2E = real backend, no MSW ❌. Don't expect `/forge accept` ui scenarios to
magically use these handlers.

## 5. The core pattern: data-driven branches (Req6 AC7)

`test/component/data-driven.example.test.ts` is the **most important file** here.
It shows how to move the combinatorial explosion (N roles × M screens × K states)
out of slow E2E and into millisecond component tests:

```ts
const cases = [
  { role: "admin", deleteVisible: true },
  { role: "viewer", deleteVisible: false },
];
describe.each(cases)("RolePanel 当 role=$role", ({ role, deleteVisible }) => {
  server.use(http.get("/api/user", () => HttpResponse.json({ data: { role } })));
  // mount → assert the UI branch for this data state
});
```

Add rows to `cases` to cover more roles/states. A 5×8 role×screen matrix
becomes 40 fast cases instead of 40 E2E scenarios.

## 6. Custom request-layer adaptation (Req6 AC14)

If your project's axios/fetch wrapper has non-standard processing (response-body
encryption/decryption, business-code interception/routing — e.g. fe_ch5's
`encryptSessionInfo`/`decryptSessionInfo`), a "standard" MSW handler may mock
green locally but fail against the real backend. Two strategies:

**Strategy A — handler returns the post-wrapper data shape**
(when you want to exercise the real wrapper chain):
```ts
// return the shape AFTER your wrapper's decryption/business-code routing
http.get("/api/user", () =>
  HttpResponse.json({ code: 1000, data: { role: "admin" } }), // already-routed form
);
```

**Strategy B — short-circuit the wrapper in component-test setup**
(when the wrapper has its own unit tests and the component test only cares
about the UI branch):
```ts
vi.mock("@/utils/http", () => ({
  request: vi.fn((url) => Promise.resolve({ data: { role: "admin" } })), // skip decrypt
}));
```

The encryption/decryption chain itself should be covered by the project's own
unit tests, not by component tests.

## 7. Add to package.json scripts

```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:component": "vitest run --config vitest.config.ts"
  }
}
```

Forge's delegate runners (ADR-0006 Req3) invoke `test:component` when an AC's
`Verify-By: vitest:component`. Without this script, the delegate returns
`INCONCLUSIVE` with a pointer back here.
