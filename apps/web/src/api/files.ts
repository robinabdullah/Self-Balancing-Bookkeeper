import "server-only";
import { send } from "./client";

// N-5 (design rule 8): the file routes (PDFs, Excel, the export, the card reveal, `/logo`) keep
// their URLs and hand the browser the api's answer as it is: its status, its body and these
// headers, so a download looks exactly as the reference's route sent it. A file can take longer
// than a page's read, so it gets its own timeout; nothing is retried.

const FILE_TIMEOUT_MS = 60_000;
const HEADERS = ["content-type", "content-disposition", "cache-control"];

type Forward = {
  body?: unknown;
  /** N-5.3: the `card_reveal` cookie in, and the api's `Set-Cookie` back (the reveal only). */
  cookie?: string;
  setCookie?: boolean;
};

/** The api's `method path` answer as this route's response. */
export async function forwardFile(method: string, path: string, opts: Forward = {}) {
  const res = await send(method, path, {
    body: opts.body,
    cookie: opts.cookie,
    timeoutMs: FILE_TIMEOUT_MS,
  });
  const headers = new Headers();
  for (const name of HEADERS) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (opts.setCookie) for (const c of res.headers.getSetCookie()) headers.append("set-cookie", c);
  return new Response(res.body, { status: res.status, headers });
}
