import type { INestApplication, Type } from "@nestjs/common";
import type { Request, Response } from "express";
import { context, withContext } from "../../apps/api/src/auth/context";

// N-6.1: web's server loaders are gone, so a test's expected values come from the api's own
// services (the same code, moved in N-3/N-4), read from the started api. Each call runs as a new
// request of its own (a fresh memo, as a web loader outside a render was), as `userId` when the
// service reads the signed-in user. The views and pages are still checked against these, and the
// parity dump checks both against the reference build.

const request = { method: "GET", header: () => undefined } as unknown as Request;

/** `load()` inside a fresh request context, as `userId`. */
export function inRequest<T>(load: () => Promise<T> | T, userId: string | null = null) {
  return new Promise<T>((resolve, reject) =>
    withContext(request, {} as Response, () => {
      context().userId = userId;
      Promise.resolve()
        .then(load)
        .then(resolve, reject);
    }),
  );
}

/** The api's `type` service, each method call run by `inRequest` (as `userId`). */
export function service<T extends object>(
  app: INestApplication,
  type: Type<T>,
  userId: string | null = null,
): T {
  const target = app.get(type);
  return new Proxy(target, {
    get(t, key) {
      const value = Reflect.get(t, key) as unknown;
      return typeof value === "function"
        ? (...args: unknown[]) => inRequest(() => value.apply(t, args) as unknown, userId)
        : value;
    },
  });
}
