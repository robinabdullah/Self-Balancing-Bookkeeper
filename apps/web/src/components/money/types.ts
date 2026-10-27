import type { MoneyEntry } from "@/lib/engine/post";

// The money entry form's types (UIDD §4.6): every single-amount type but `opening`, which only
// the opening import writes (SRS §9). Plain module, so the server page can check `?type=`.

export type MoneyType = MoneyEntry["type"];

/** What each type is called in the form (and the type picker). */
export const LABEL: Partial<Record<MoneyType, string>> = {
  customer_payment: "Payment in",
  customer_cash_given: "Cash given to customer",
  customer_discount: "Customer discount",
  customer_profit_share: "Profit share",
  supplier_payment: "Supplier payment",
  card_payment: "Card payment",
  card_cash_out: "Cash-out",
  card_fee: "Card fee",
  cashback: "Cashback",
  expense: "Expense",
  capital_in: "Capital in",
  capital_out: "Capital out",
  profit_paid: "Profit paid",
  profit_reinvested: "Profit reinvested",
  opening_correction: "Opening correction",
};
export const TYPES = Object.entries(LABEL) as [MoneyType, string][];
export const isFormType = (t: string | undefined): t is MoneyType => !!t && t in LABEL;
