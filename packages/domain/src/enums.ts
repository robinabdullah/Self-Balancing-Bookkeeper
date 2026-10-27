// N-1.3 (D-068): the DB enums' values (SRS §4), here so the engine, the forms' validation and the
// schema share one list without the domain importing the DB. The schema builds each pgEnum from
// its list (`pgEnum("money_type", MONEY_TYPE_VALUES)`); the theme's list is `themes` in themes.ts.

export const PROFILE_ROLE_VALUES = ["partner", "investor", "employee"] as const;
// A card's Type (D-036); "none" until it is set, and the badge then reads the name.
export const CARD_NETWORK_VALUES = ["visa", "mastercard", "amex", "none"] as const;
export const PERSON_KIND_VALUES = ["partner", "investor"] as const;
export const PURCHASE_SOURCE_VALUES = [
  "cash",
  "card",
  "supplier_credit",
  "customer_offset",
  "opening",
  "opening_correction",
] as const;
export const RETURN_KIND_VALUES = ["customer", "purchase"] as const;
export const REFUND_TO_VALUES = ["cash", "card", "supplier", "customer"] as const;
export const RETURN_REASON_VALUES = ["returned", "damaged_lost"] as const;
export const MONEY_TYPE_VALUES = [
  "customer_payment",
  "customer_cash_given",
  "customer_discount",
  "customer_profit_share",
  "supplier_payment",
  "card_payment",
  "card_cash_out",
  "card_fee",
  "cashback",
  "expense",
  "capital_in",
  "capital_out",
  "profit_paid",
  "profit_reinvested",
  "opening",
  "opening_correction",
] as const;
export const PAY_SOURCE_VALUES = ["cash", "card"] as const;
export const SETTLE_MODE_VALUES = ["received", "added_to_due"] as const;
export const OPENING_KIND_VALUES = [
  "cash",
  "customer_due",
  "supplier_due",
  "card_balance",
  "capital",
  "profit_owed",
  "opening_difference",
] as const;
export const ALLOCATION_KIND_VALUES = ["cash", "card", "partner"] as const;
export const AUDIT_ACTION_VALUES = [
  "insert",
  "update",
  "delete",
  "reverse",
  "close",
  "reopen",
  "export",
  "reveal", // a card's details shown (CR-026), never the values
] as const;
