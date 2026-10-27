import { context } from "./context";

// N-2.3 (design rule 5): replaces React `cache()`. A page render makes several api calls (layout,
// page) with the same X-Render-Id; a GET in that render shares each loaded value (e.g. the books)
// for 30 s, so `loadBooksData` runs once per render. Without a render id, and on every write, a
// value is shared within the one request only, so a write never reads a render's old value.
const TTL_MS = 30_000;
const renders = new Map<string, { expires: number; values: Map<string, Promise<unknown>> }>();

function renderValues(id: string) {
  const now = Date.now();
  for (const [k, r] of renders) if (r.expires <= now) renders.delete(k);
  let r = renders.get(id);
  if (!r) renders.set(id, (r = { expires: now + TTL_MS, values: new Map() }));
  return r.values;
}

/** `load()` once per render (GET) or per request; a failure is not kept. */
export function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const c = context();
  const values =
    c.method === "GET" && c.renderId ? renderValues(`${c.userId}:${c.renderId}`) : c.memo;
  let p = values.get(key) as Promise<T> | undefined;
  if (!p) {
    const loading = load();
    values.set(key, loading);
    loading.catch(() => {
      if (values.get(key) === loading) values.delete(key);
    });
    p = loading;
  }
  return p;
}
