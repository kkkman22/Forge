export function createRendererRegistry() {
    const map = new Map();
    return {
        register(name, fn) {
            map.set(name, fn);
        },
        resolve(name) {
            return map.get(name);
        },
        list() {
            return [...map.keys()];
        },
    };
}
//# sourceMappingURL=renderer-registry.js.map