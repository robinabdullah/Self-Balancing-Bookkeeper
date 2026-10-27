// The money entry form (UIDD §4.6): one schema per `type`, with the fields SRS §4 allows for it.
// Zod is the source of truth for those fields; anything else the form sends is dropped, so a
// stray value (e.g. a card left picked after switching to Cash) is never stored.
// `opening` entries come only from the opening import (SRS §9), not from this form.
import { z } from "zod";
import { moneyType, openingKind, paySource, settleMode } from "@/db/schema";
import { monthOf } from "@/lib/dates";
import {
  CARD_FEE_CATEGORY,
  EXPENSE_CATEGORIES,
  date,
  money,
  month,
  note,
  optional,
  optionalPick,
  pick,
  rowId,
} from "@/lib/validation/fields";

const types = z.enum(moneyType.enumValues);
const base = { id: rowId, date, note };
const amount = money();
const customerId = pick("a customer");
const cardId = pick("a card");

/** Paid by (or received into) cash or a card; the card is needed only for a card. */
const paidBy = {
  source: z.enum(paySource.enumValues, { error: "Choose Cash or Card" }),
  cardId: optionalPick,
};

function needCard<T extends { source: "cash" | "card"; cardId: string | null }>(
  v: T,
  ctx: z.RefinementCtx,
): T {
  if (v.source === "card" && !v.cardId)
    ctx.addIssue({ code: "custom", path: ["cardId"], message: "Pick a card" });
  return { ...v, cardId: v.source === "card" ? v.cardId : null };
}

const customerEntry = z.object({
  ...base,
  type: types.extract(["customer_payment", "customer_cash_given", "customer_discount"]),
  customerId,
  amount,
});

const profitShare = z.object({
  ...base,
  type: z.literal("customer_profit_share"),
  customerId,
  amount,
  forMonth: month,
  settleMode: z.enum(settleMode.enumValues, { error: "Choose Received now or Add to his due" }),
});

const supplierPayment = z
  .object({
    ...base,
    type: z.literal("supplier_payment"),
    supplierId: pick("a supplier"),
    amount,
    ...paidBy,
  })
  .transform(needCard);

const cardPayment = z.object({ ...base, type: z.literal("card_payment"), cardId, amount });

/** amount = card_charged; the difference to cash_received is the fee (SRS §4, §5). */
const cardCashOut = z
  .object({
    ...base,
    type: z.literal("card_cash_out"),
    cardId,
    cardCharged: money(),
    cashReceived: money(),
  })
  .transform((v, ctx) => {
    if (v.cashReceived > v.cardCharged)
      ctx.addIssue({
        code: "custom",
        path: ["cashReceived"],
        message: "Cash received can't exceed amount charged",
      });
    return { ...v, amount: v.cardCharged };
  });

const cardFee = z
  .object({ ...base, type: z.literal("card_fee"), cardId, amount })
  .transform((v) => ({ ...v, category: CARD_FEE_CATEGORY }));

const cashback = z
  .object({ ...base, type: z.literal("cashback"), amount, ...paidBy })
  .transform(needCard);

/** for_month defaults to the month of the date (SRS §4). */
const expense = z
  .object({
    ...base,
    type: z.literal("expense"),
    amount,
    category: z.enum(EXPENSE_CATEGORIES, { error: "Pick a category" }),
    ...paidBy,
    forMonth: optional(month),
  })
  .transform((v, ctx) => ({ ...needCard(v, ctx), forMonth: v.forMonth ?? monthOf(v.date) }));

const personId = pick("a person");
const personEntry = z.object({
  ...base,
  type: types.extract(["capital_in", "profit_paid", "profit_reinvested"]),
  personId,
  amount,
});

/** D-060: paid in cash, or by a card (their own spending the business pays); none → cash. */
const capitalOut = z
  .object({
    ...base,
    type: z.literal("capital_out"),
    personId,
    amount,
    ...paidBy,
    source: paidBy.source.default("cash"),
  })
  .transform(needCard);

/** What an opening correction fixes, and the picker that names its target (SRS §4). */
const CORRECTION_TARGET = {
  cash: null,
  customer_due: "customerId",
  supplier_due: "supplierId",
  card_balance: "cardId",
  capital: "personId",
  profit_owed: "personId",
} as const;
const TARGET_LABEL = {
  customerId: "a customer",
  supplierId: "a supplier",
  cardId: "a card",
  personId: "a person",
} as const;
type Target = keyof typeof TARGET_LABEL;

/** A signed change (≠ 0) to one opening item; only its own target is kept. */
const openingCorrection = z
  .object({
    ...base,
    type: z.literal("opening_correction"),
    openingKind: z
      .enum(openingKind.enumValues, { error: "Pick what was wrong" })
      .exclude(["opening_difference"], { error: "Pick what was wrong" }),
    customerId: optionalPick,
    supplierId: optionalPick,
    cardId: optionalPick,
    personId: optionalPick,
    amount: money("nonZero"),
  })
  .transform((v, ctx) => {
    const target = CORRECTION_TARGET[v.openingKind];
    if (target && !v[target])
      ctx.addIssue({ code: "custom", path: [target], message: `Pick ${TARGET_LABEL[target]}` });
    const keep = (t: Target) => (t === target ? v[t] : null);
    return {
      ...v,
      customerId: keep("customerId"),
      supplierId: keep("supplierId"),
      cardId: keep("cardId"),
      personId: keep("personId"),
    };
  });

export const moneyEntrySchema = z.discriminatedUnion("type", [
  customerEntry,
  profitShare,
  supplierPayment,
  cardPayment,
  cardCashOut,
  cardFee,
  cashback,
  expense,
  personEntry,
  capitalOut,
  openingCorrection,
]);

export type MoneyEntryInput = z.input<typeof moneyEntrySchema>;
export type MoneyEntryValues = z.output<typeof moneyEntrySchema>;
