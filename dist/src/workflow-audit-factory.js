import { isFrozenZonePath } from "./check-frozen.js";
import { WorkflowAuditWriter } from "./workflow-audit-writer.js";
/**
 * Create a WorkflowAuditWriter pre-configured with the standard frozen-zone
 * checker from check-frozen.ts.  SKILL instructions reference this factory
 * so that the Claude agent can build an auditWriter without knowing internal
 * import paths.
 *
 * **Validates: R2 wiring (P1-1)**
 */
export function createAuditWriter(forgeRoot, hookCheckPath) {
    return new WorkflowAuditWriter(forgeRoot, isFrozenZonePath, hookCheckPath);
}
//# sourceMappingURL=workflow-audit-factory.js.map