/** Explicit, tab-local fixture mode. Never copy or fall back to normal saves. */
export const DEBUG_QUERY = "debug_fixture";
export const DEBUG_VALUE = "shield";
export const DEBUG_PREFIX = "wreckline.DEBUG_FIXTURE.shield.v1:";
export const DEBUG_META_KEY = "DEBUG_FIXTURE.meta";

export function debugRequested(search: string): boolean {
  return new URLSearchParams(search).get(DEBUG_QUERY) === DEBUG_VALUE;
}

/** Storage methods, enumeration, property access and clear are all scoped. */
export function scopedStorage(native: Storage, prefix = DEBUG_PREFIX): Storage {
  const keys = () => Array.from({ length: native.length }, (_, i) => native.key(i))
    .filter((k): k is string => k != null && k.startsWith(prefix)).map(k => k.slice(prefix.length));
  const api = {
    get length() { return keys().length; },
    key(i: number) { return keys()[i] ?? null; },
    getItem(k: string) { return native.getItem(prefix + k); },
    setItem(k: string, v: string) { native.setItem(prefix + k, String(v)); },
    removeItem(k: string) { native.removeItem(prefix + k); },
    clear() { for (const k of keys()) native.removeItem(prefix + k); },
  };
  return new Proxy(api as Storage, {
    get(target, key, receiver) { return typeof key !== "string" || key in target ? Reflect.get(target, key, receiver) : target.getItem(key) ?? undefined; },
    set(target, key, value) { if (typeof key !== "string" || key in target) return false; target.setItem(key, String(value)); return true; },
    deleteProperty(target, key) { if (typeof key !== "string" || key in target) return false; target.removeItem(key); return true; },
    ownKeys() { return keys(); },
    getOwnPropertyDescriptor(target, key) { return typeof key === "string" && keys().includes(key) ? { configurable: true, enumerable: true, writable: true, value: target.getItem(key) } : undefined; },
  });
}

export const DEBUG_FIXTURE_ACTIVE = typeof window !== "undefined" && debugRequested(window.location.search);
const normalReader = DEBUG_FIXTURE_ACTIVE ? window.localStorage.getItem.bind(window.localStorage) : null;

/** Explicit copy is read-only: callers never receive a writable normal store. */
export function readNormalSaveKey(key: string): string | null {
  if (!DEBUG_FIXTURE_ACTIVE || !normalReader) throw new Error("実験室の外では使用できません");
  return normalReader(key);
}

// Run before any app imports read storage (constants.ts imports this module).
// Failure is fatal rather than silently proceeding with the normal save.
if (DEBUG_FIXTURE_ACTIVE) {
  const local = scopedStorage(window.localStorage), session = scopedStorage(window.sessionStorage);
  Object.defineProperty(window, "localStorage", { configurable: true, get: () => local });
  Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => session });
}

export function debugModuleUrl(url: string): string {
  if (!DEBUG_FIXTURE_ACTIVE) return url;
  const u = new URL(url);
  // A same-origin production preview may be served off GitHub for verification.
  const project = "/-explore-sort-trade-game/";
  if (location.pathname.startsWith(project) && u.pathname.startsWith(project)) {
    u.host = location.host;
    u.protocol = location.protocol;
  }
  u.searchParams.set(DEBUG_QUERY, DEBUG_VALUE);
  return u.toString();
}
