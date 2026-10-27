// N-2.4 (design rule 7): what a value looks like after the api's JSON round trip. A Date arrives
// as its ISO string, and functions and `undefined` don't arrive at all, so a page typed with
// `Jsonify<T>` can't treat a `createdAt` string as a Date.
type Fn = (...args: never[]) => unknown;

export type Jsonify<T> = T extends Date
  ? string
  : T extends string | number | boolean | null
    ? T
    : T extends undefined | Fn | symbol
      ? never
      : T extends readonly (infer U)[]
        ? Jsonify<U>[]
        : { [K in keyof T as T[K] extends Fn ? never : K]: Jsonify<T[K]> };
