import { safeFrom, withQuery } from "./href";
import { parse, plain } from "./money";
import { rowId } from "./validation/fields";

// D-032: a new-entry form opened from a page (a quick action, "Pay ৳remaining") starts with that
// customer / supplier / card / person picked and, for a card payment, the amount filled in; it
// goes back to `from` after Save or Cancel. Only what the form can use is kept: a bad, unknown or
// inactive id, a Walk-in where it isn't allowed (D-009), or an amount that isn't > 0 is dropped,
// so the form never starts with something the server would reject. The user can change it all.

/** Which ids a form can take: a money type, "sale" or "purchase". */
const TAKES: Record<string, ("customerId" | "supplierId" | "cardId" | "personId" | "amount")[]> = {
  customer_payment: ["customerId", "amount"],
  customer_cash_given: ["customerId", "amount"],
  customer_discount: ["customerId", "amount"],
  customer_profit_share: ["customerId", "amount"],
  supplier_payment: ["supplierId", "cardId", "amount"],
  card_payment: ["cardId", "amount"],
  card_fee: ["cardId", "amount"],
  card_cash_out: ["cardId"],
  cashback: ["cardId", "amount"],
  expense: ["cardId", "amount"],
  capital_in: ["personId", "amount"],
  capital_out: ["personId", "cardId", "amount"],
  profit_paid: ["personId", "amount"],
  profit_reinvested: ["personId", "amount"],
  sale: ["customerId"],
  purchase: ["supplierId", "cardId"],
};

/** Forms where a card means "paid by / received in: Card" (a Cash · Card choice). */
const CARD_SOURCE = new Set(["supplier_payment", "cashback", "expense", "capital_out", "purchase"]);
/** D-009: Walk-in can't be given cash or a profit share. */
const NO_WALK_IN = new Set(["customer_cash_given", "customer_profit_share"]);

type Params = Record<string, string | string[] | undefined>;

type Row = { id: string; active: boolean };
/** What it reads of the Setup data (the web's `loadSetup`): ids, active, and the Walk-in flag. */
type SetupRows = {
  customers: (Row & { isSystem: boolean })[];
  suppliers: Row[];
  cards: Row[];
  people: Row[];
};

/** The form's starting values and its return path, from the page's URL params. */
export function cleanPrefill(form: string | null | undefined, params: Params, setup: SetupRows) {
  const one = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : undefined;
  };
  const prefill: Record<string, string> = {};
  const takes = (form && TAKES[form]) || [];
  const id = (key: string) => {
    const v = one(key);
    return v && rowId.safeParse(v).success ? v : undefined;
  };
  const active = <R extends { id: string; active: boolean }>(rows: R[], value?: string) =>
    value ? rows.find((r) => r.id === value && r.active) : undefined;

  if (takes.includes("customerId")) {
    const c = active(setup.customers, id("customerId"));
    if (c && !(c.isSystem && NO_WALK_IN.has(form!))) prefill.customerId = c.id;
  }
  if (takes.includes("supplierId")) {
    const s = active(setup.suppliers, id("supplierId"));
    if (s) prefill.supplierId = s.id;
  }
  if (takes.includes("cardId")) {
    const c = active(setup.cards, id("cardId"));
    if (c) {
      prefill.cardId = c.id;
      if (CARD_SOURCE.has(form!)) prefill.source = "card";
    }
  }
  if (takes.includes("personId")) {
    const p = active(setup.people, id("personId"));
    if (p) prefill.personId = p.id;
  }
  if (takes.includes("amount")) {
    const poisha = parse(one("amount") ?? "");
    if (poisha != null && poisha > 0) prefill.amount = plain(poisha);
  }
  return { prefill, from: safeFrom(one("from")) };
}

/** Opening stock has no Return from its entry sheet (D-074, the user's pick). */
const OPENING = new Set<string>(["opening", "opening_correction"]);

/** What it reads of the api's return options (`ReturnOptionsService`; the domain can't import it). */
type ReturnOptions = {
  lines: { id: string; saleId: string; customerId: string; left: number }[];
  lots: { id: string; purchaseId: string; source: string; remaining: number; createdAt: string }[];
};

/**
 * D-074: the Return form opened from a purchase's or a sale's entry sheet starts set to it: a
 * purchase → Purchase return, Returned to seller, its first lot with stock; a sale → Customer
 * return, its customer and bill, its first line with something left. Anything the form couldn't
 * use (a missing kind, an unknown, used-up or foreign id, opening stock, an inactive customer)
 * is dropped and the form opens empty.
 */
export function cleanReturnPrefill(
  params: Params,
  options: ReturnOptions,
  setup: { customers: Row[] },
): { initial: Record<string, string>; from?: string } {
  const one = (key: string) => {
    const v = params[key];
    return typeof v === "string" && rowId.safeParse(v).success ? v : undefined;
  };
  const from = safeFrom(params.from);
  const purchaseId = one("purchaseId");
  const saleId = one("saleId");
  if (params.kind === "purchase" && purchaseId) {
    const [lot] = options.lots
      .filter((l) => l.purchaseId === purchaseId && l.remaining > 0 && !OPENING.has(l.source))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    if (lot)
      return { initial: { kind: "purchase", reason: "returned", "lines.0.lotId": lot.id }, from };
  }
  if (params.kind === "customer" && saleId) {
    const line = options.lines.find((l) => l.saleId === saleId && l.left > 0);
    const active = line && setup.customers.some((c) => c.id === line.customerId && c.active);
    if (line && active)
      return {
        initial: {
          kind: "customer",
          customerId: line.customerId,
          saleId,
          "lines.0.saleLineId": line.id,
        },
        from,
      };
  }
  return { initial: {}, from };
}

/** The params of the entry sheet's Return link (D-074), or null when the form couldn't start set to it. */
export function returnParams(
  row: { table: string; id: string },
  options: ReturnOptions,
  setup: { customers: Row[] },
): { kind: string; purchaseId?: string; saleId?: string } | null {
  const params =
    row.table === "purchase"
      ? { kind: "purchase", purchaseId: row.id }
      : row.table === "sale"
        ? { kind: "customer", saleId: row.id }
        : null;
  if (!params || !cleanReturnPrefill(params, options, setup).initial.kind) return null;
  return params;
}

/** The entry sheet's Return link (D-074), or null when the form couldn't start set to it. */
export function returnLink(
  row: { table: string; id: string },
  options: ReturnOptions,
  setup: { customers: Row[] },
  from: string,
): string | null {
  const params = returnParams(row, options, setup);
  return params && withQuery("/returns/new", { ...params, from });
}
