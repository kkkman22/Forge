/**
 * @non-production NOT FOR PRODUCTION — in-repo dogfood reference domain.
 *
 * This directory hosts a DDD PMS example domain (slice A). It is a readable,
 * modifiable reference, NOT a Forge runtime module:
 *   - excluded from the main build (root tsconfig exclude)
 *   - not shipped in dist/plugin bundles
 *   - consumes src/state-machine/ (one-way dependency; engine never imports here)
 *
 * See .tinkerman/specs/domain-example-reference-impl/ for the spec.
 */

export {};
