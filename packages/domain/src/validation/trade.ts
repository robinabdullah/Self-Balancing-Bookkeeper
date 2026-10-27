// The purchase, sale and return forms (UIDD §4.3–§4.5; fields per SRS §4 Trade). Each source or
// refund target keeps only its own picker; anything else the form sends is dropped. What needs
// the database (lot remaining, sold − returned, dates of the sale or purchase returned, Walk-in)
// is checked by the action and the guards, not here.
import { z } from "zod";
import { PURCHASE_SOURCE_VALUES, REFUND_TO_VALUES, RETURN_REASON_VALUES } from "../enums";
import {
  date,
  int,
  money,
  month,
  note,
  optional,
  optionalPick,
  optionalText,
  pick,
  rowId,
} from "./fields";

const lines = <T extends z.ZodType>(line: T) =>
  z.array(line, { error: "Add at least one line" }).min(1, { error: "Add at least one line" });

const issue = (ctx: z.RefinementCtx, field: string, message: string) =>
  ctx.addIssue({ code: "custom", path: [field], message });

// ---- Purchase ----

/** A purchase line is a lot; its id is the lot id. The user types the unit cost (SRS §3). */
const purchaseLine = z.object({
  id: rowId,
  modelId: pick("a model"),
  qty: int(1),
  unitCost: money(),
  imeiNote: optionalText,
});

/**
 * Paid by: cash, card (+ EMI ≥ 2 and a bill-month override), supplier credit (supplier
 * required), customer's due, or an opening correction (a missed lot). `opening` lots come only
 * from the opening import (SRS §9).
 */
export const purchaseSchema = z
  .object({
    id: rowId,
    date,
    source: z
      .enum(PURCHASE_SOURCE_VALUES, { error: "Choose how it was paid" })
      .exclude(["opening"], { error: "Choose how it was paid" }),
    supplierId: optionalPick,
    cardId: optionalPick,
    customerId: optionalPick,
    emiMonths: optional(int(2)),
    billMonthOverride: optional(month),
    note,
    lines: lines(purchaseLine),
  })
  .transform((v, ctx) => {
    const card = v.source === "card";
    if (card && !v.cardId) issue(ctx, "cardId", "Pick a card");
    if (v.source === "supplier_credit" && !v.supplierId)
      issue(ctx, "supplierId", "Pick a supplier");
    if (v.source === "customer_offset" && !v.customerId)
      issue(ctx, "customerId", "Pick a customer");
    if (!card && v.emiMonths !== null) issue(ctx, "emiMonths", "EMI is only for card purchases");
    if (!card && v.billMonthOverride !== null)
      issue(ctx, "billMonthOverride", "Bill month is only for card purchases");
    return {
      ...v,
      cardId: card ? v.cardId : null,
      customerId: v.source === "customer_offset" ? v.customerId : null,
    };
  });

// ---- Sale ----

/**
 * No lot → the server picks oldest first; a lot → a manual choice (SRS §4). A loss is allowed.
 * `id` = a stored sale line being edited: it keeps its lot (D-004).
 */
const saleLine = z.object({
  id: optional(rowId),
  modelId: pick("a model"),
  qty: int(1),
  unitPrice: money("nonNegative"),
  lotId: optionalPick,
});

/**
 * "Received now" creates a customer payment with the same date, in the same save (UIDD §4.4);
 * `paymentId` is its id, so the toast's Undo can remove both (D-006).
 */
export const saleSchema = z
  .object({
    id: rowId,
    date,
    customerId: pick("a customer"),
    note,
    lines: lines(saleLine),
    receivedNow: optional(money()),
    paymentId: optional(rowId),
  })
  .transform((v, ctx) => {
    if (v.receivedNow !== null && !v.paymentId)
      issue(ctx, "receivedNow", "Missing id — reload the form");
    return { ...v, paymentId: v.receivedNow === null ? null : v.paymentId };
  });

// ---- Returns ----

/** Refund per unit defaults to the sale price in the form (UIDD §4.5). */
const customerReturn = z.object({
  id: rowId,
  kind: z.literal("customer"),
  date,
  customerId: pick("a customer"),
  note,
  lines: lines(
    z.object({ saleLineId: pick("a bill line"), qty: int(1), unitAmount: money("nonNegative") }),
  ),
});

const REFUND_TARGET = {
  cash: null,
  card: "cardId",
  supplier: "supplierId",
  customer: "customerId",
} as const;
const TARGET_LABEL = { cardId: "a card", supplierId: "a supplier", customerId: "a customer" };
type Target = keyof typeof TARGET_LABEL;

/**
 * Returned to the seller: the refund goes to cash, a card, the supplier's due or the customer's
 * due, with its target. Damaged / lost is the v1 write-off: refund 0, no target (SRS §4).
 */
const purchaseReturn = z
  .object({
    id: rowId,
    kind: z.literal("purchase"),
    date,
    reason: z.enum(RETURN_REASON_VALUES, { error: "Choose Returned or Damaged / lost" }),
    refundTo: optional(z.enum(REFUND_TO_VALUES, { error: "Choose where the refund goes" })),
    cardId: optionalPick,
    supplierId: optionalPick,
    customerId: optionalPick,
    note,
    lines: lines(z.object({ lotId: pick("a lot"), qty: int(1), unitAmount: money("nonNegative") })),
  })
  .transform((v, ctx) => {
    const writeOff = v.reason === "damaged_lost";
    if (!writeOff && !v.refundTo) issue(ctx, "refundTo", "Choose where the refund goes");
    const target = writeOff || !v.refundTo ? null : REFUND_TARGET[v.refundTo];
    if (target && !v[target]) issue(ctx, target, `Pick ${TARGET_LABEL[target]}`);
    const keep = (t: Target) => (t === target ? v[t] : null);
    return {
      ...v,
      refundTo: writeOff ? null : v.refundTo,
      cardId: keep("cardId"),
      supplierId: keep("supplierId"),
      customerId: keep("customerId"),
      lines: writeOff ? v.lines.map((l) => ({ ...l, unitAmount: 0 })) : v.lines,
    };
  });

export const returnSchema = z.discriminatedUnion("kind", [customerReturn, purchaseReturn]);

export type PurchaseValues = z.output<typeof purchaseSchema>;
export type SaleValues = z.output<typeof saleSchema>;
export type ReturnValues = z.output<typeof returnSchema>;
