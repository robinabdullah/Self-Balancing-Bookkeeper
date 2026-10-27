import { safeFrom } from "@/lib/href";
import { parse, plain } from "@/lib/money";
import { rowId } from "@/lib/validation/fields";
import type { SetupData } from "@/server/setup";

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

/** The form's starting values and its return path, from the page's URL params. */
export function cleanPrefill(form: string | null | undefined, params: Params, setup: SetupData) {
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
