import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** False on the server and in the hydration render, true after: an entry form makes its ids in
 *  the browser (SRS §3) and shows them only then, so the server's HTML and the first render agree. */
export function useHydrated() {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
