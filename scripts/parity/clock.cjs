// N-1.1: preloaded into `next start` (NODE_OPTIONS=--require) by the parity harness. The app
// reads the real time (`dhakaToday()`), so the server's Date starts at PARITY_NOW and runs on from
// there: "today", "this month" and the PDFs' date are the same on every run and every day. The DB
// keeps its own clock (`now()`), which normalize.ts masks.
const target = Date.parse(process.env.PARITY_NOW ?? "");
if (!Number.isNaN(target)) {
  const RealDate = Date;
  const offset = target - RealDate.now();
  const now = () => RealDate.now() + offset;
  function ParityDate(...args) {
    if (!new.target) return new RealDate(now()).toString();
    return args.length ? new RealDate(...args) : new RealDate(now());
  }
  // Own properties: the middleware sandbox copies globals by their own keys.
  Object.assign(ParityDate, { now, parse: RealDate.parse, UTC: RealDate.UTC });
  ParityDate.prototype = RealDate.prototype; // instanceof Date
  globalThis.Date = ParityDate;
}
