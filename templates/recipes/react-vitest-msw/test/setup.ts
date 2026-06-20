// Component-test setup: start the MSW server before tests, reset handlers
// between tests (so server.use() overrides don't leak), and close on teardown.
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../msw/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
