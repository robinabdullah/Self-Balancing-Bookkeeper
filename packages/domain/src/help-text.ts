// UIDD §3: every form's "About this form" text, copied from the UIDD table. When a form or rule
// changes, its text changes in the same commit. The ⓘ field texts (`fieldHelp`) are copied from
// the two UIDD §3 ⓘ tables: Setup (D-023) and the entry forms (D-024).

export const aboutText = {
  sale: "A bill for phones sold to a customer. Cost comes from the oldest stock first; the profit counts in this month.",
  purchase: "Phones bought for stock. Each line becomes a stock lot at its unit cost.",
  customer_return: "Phones a customer gives back from one of their bills.",
  purchase_return: "Phones sent back to the seller, or written off as damaged / lost.",
  customer_payment: "Money a customer paid us. It lowers what they owe.",
  customer_cash_given:
    "Cash we gave a customer (e.g. for a deal). It raises what they owe; no profit.",
  customer_discount:
    "Writes off a small leftover that a customer owes. It lowers this month's profit.",
  customer_profit_share:
    "A customer's share of their shop profit for a month. Received in cash, or added to their due.",
  supplier_payment: "Money we paid a supplier we owe, from cash or a card.",
  card_payment: "Business cash paid into a card bill.",
  card_cash_out: "Cash taken out through a card. The difference is a fee (business expense).",
  card_fee: "A fee or interest charged on a card. It is a business expense.",
  cashback: "Cashback received on a card or in cash. It counts as profit.",
  expense: "A business cost (salary, rent, delivery …) for a month.",
  capital:
    "Money a person puts into, or takes out of, the business. Out can be paid by a card: the person's own spending that the business pays with the card's bill.",
  profit_paid_reinvested:
    "Profit owed to a person, paid in cash or kept in the business as capital.",
  opening_correction: "Fixes an opening balance entered wrongly at go-live.",
  setup_person:
    "A partner or investor in the business. Partners also have a profit share %; the partners' shares must total 100. A sole owner is one partner at 100.",
  setup_card:
    'A card used for business purchases, named by its bank ("EBL") with its Type (Visa, Mastercard, Amex). Statement and due days set the bill dates.',
  setup_customer:
    'A mobile shop we sell to, shown as "Shop name (Proprietor)". Contact details and target balance are optional.',
  setup_supplier: "A seller we buy phones from. We owe them when we buy on supplier credit.",
  setup_model:
    'A phone model with one clean name (e.g. "Vivo Y05 4/64"). Purchases and sales pick from this list.',
  card_bill_dates:
    "The real statement or due date for one month, when the bank moved it. Other months keep the card's usual days.",
  card_details:
    "The card's number, expiry and CVV, saved encrypted: its primary card or a supplementary card on the same bill. They show only after your fingerprint, for 30 seconds.",
  fingerprint_setup:
    "Lets this device reveal saved card details with your fingerprint. Your login password is checked first.",
} as const;

export type AboutForm = keyof typeof aboutText;

/** UIDD §3: ⓘ texts for the non-obvious fields. */
export const fieldHelp = {
  // Setup (D-023)
  statement_day:
    "The day each month the bank makes this card's bill. A charge on or before it goes on that bill.",
  due_day: "The day the bill must be paid: the first such day after the statement date.",
  credit_limit: "Optional. Used only to show roughly how much is still available on the card.",
  target_balance:
    "Optional. The due we want this shop to stay within (e.g. ৳60L). Their page shows how far above it they are.",
  profit_share_pct:
    "This partner's share of the profit left after investors are paid. The partners' shares must total 100 before a month can be closed; a sole owner sets 100.",
  // Entry forms (D-024)
  purchase_paid_by:
    "How the phones were paid for. Cash leaves the cash box; Card adds to that card's bill; Supplier credit means we owe the supplier; Customer's due lowers what that customer owes us.",
  purchase_emi:
    "The bank splits this card purchase into equal monthly parts (2 or more). The full amount counts at once; each month's bill gets one part.",
  purchase_bill_month:
    "Optional. The card bill this charge goes on, when the bank put it on a different bill than its date suggests.",
  purchase_unit_cost:
    "The cost of one phone, not the line total. The stock lot keeps this cost to work out profit.",
  capital_out_paid_by:
    "Cash leaves the cash box. Card: the person's own spending on a card that the business pays with its bill; it adds to that card's bill and comes off their capital.",
  sale_choose_lot:
    "The app takes the oldest stock first. Pick one lot only when you know which phones were sold.",
  sale_received_now:
    "Optional. Cash the customer paid with this bill. It is saved as a separate payment on the same date.",
  return_refund_per_unit:
    "What is given back for each phone. A customer return starts at the sale price, a purchase return at the lot's cost; Damaged / lost is always 0.",
  return_refund_to:
    "Where the refund comes back: cash, the card, less owed to the supplier, or the customer's due. It starts as the way the lot was paid for; an opening lot has none, so pick one.",
  return_damaged_lost:
    "Phones that can't be sold or sent back. Stock goes down by their cost, and that cost is a loss this month; no refund.",
  card_cash_out_amounts:
    "Charged to card is the full amount on the card bill; Cash received is what came into hand. The difference is a fee (business expense).",
  for_month:
    "The month this belongs to; it can be before the date (e.g. September salary paid on 5 Oct). Its profit counts in that month.",
  profit_share_settle:
    "Received now: the customer paid the share in cash. Add to his due: it is added to what they owe us.",
  opening_correction_kind:
    "The opening balance that was entered wrongly at go-live, and whose it is (customer, supplier, card or person).",
  opening_correction_change:
    "How much to add (+) or take off (−). The partners' opening difference changes to keep the books balanced.",
} as const;

export type HelpField = keyof typeof fieldHelp;

/** UIDD §4.8: ⓘ texts on views (not form fields). */
export const viewHelp = {
  available: "approximate — excludes personal spending not entered as Personal spend",
  salesReport:
    "sales profit after customer returns; a reversed sale counts on the day it was reversed",
} as const;
