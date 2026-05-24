/**
 * PBT for hooks config integrity — forbids unbounded head/tail/cat injection.
 *
 * Property 4: No hook config may contain commands matching
 * `head|tail|cat .forge/(plans|progress)/.*` without a byte/line limit.
 *
 * Also validates all 3 config files as static fixtures.
 */
export {};
