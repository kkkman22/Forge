// setupServer — for component tests (Node process). MSW intercepts at the
// Node http layer, so handlers from the registry take effect directly.
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
