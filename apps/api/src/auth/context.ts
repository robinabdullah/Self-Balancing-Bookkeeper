import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

// N-2.3: what a request knows about itself, readable anywhere below the controller without
// passing it down (requirePartner, the memo). Web sends one random X-Render-Id per page render.
export type RequestContext = {
  method: string;
  /** The page render this read belongs to (web's X-Render-Id), or null. */
  renderId: string | null;
  /** From the verified token (jwt.guard.ts); null on a @Public route. */
  userId: string | null;
  email: string | null;
  /** N-3.8: the browser's host, protocol and user agent, as web forwards them (passkeys, audit). */
  host: string | null;
  proto: string | null;
  userAgent: string | null;
  /** This request's own memo (memo.ts). */
  memo: Map<string, Promise<unknown>>;
};

const als = new AsyncLocalStorage<RequestContext>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function context(): RequestContext {
  const c = als.getStore();
  if (!c) throw new Error("No request context");
  return c;
}

/** Express middleware: runs the rest of the request inside its own context. */
export function withContext(req: Request, _res: Response, next: NextFunction) {
  const renderId = req.header("x-render-id") ?? "";
  als.run(
    {
      method: req.method,
      renderId: UUID.test(renderId) ? renderId : null,
      userId: null,
      email: null,
      host: req.header("x-forwarded-host") ?? null,
      proto: req.header("x-forwarded-proto") ?? null,
      userAgent: req.header("user-agent") ?? null,
      memo: new Map(),
    },
    next,
  );
}
