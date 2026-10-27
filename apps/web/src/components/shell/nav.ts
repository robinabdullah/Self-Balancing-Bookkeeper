import { withQuery } from "@mbl/domain/href";

// UIDD §3: the app's navigation. The form routes are placeholders until each form's task.

export type NavLink = { label: string; href: string };

export const money = (type: string) => `/money/new?type=${type}`;

// The New action sheet, ordered by how often each is used.
export const newEntries: NavLink[] = [
  { label: "Sale", href: "/sales/new" },
  { label: "Payment in", href: money("customer_payment") },
  { label: "Purchase", href: "/purchases/new" },
  { label: "Card payment", href: money("card_payment") },
  { label: "Expense", href: money("expense") },
  { label: "Cash-out", href: money("card_cash_out") },
  { label: "Return", href: "/returns/new" },
];

// New → More…
export const moreEntries: NavLink[] = [
  { label: "Supplier payment", href: money("supplier_payment") },
  { label: "Profit share", href: money("customer_profit_share") },
  { label: "Customer discount", href: money("customer_discount") },
  { label: "Cash given to customer", href: money("customer_cash_given") },
  { label: "Card fee", href: money("card_fee") },
  { label: "Cashback", href: money("cashback") },
  { label: "Capital in / out", href: money("capital_in") },
  { label: "Profit paid / reinvested", href: money("profit_paid") },
  { label: "Opening correction", href: money("opening_correction") },
];

// Accounts has tabs; the tab bar's Accounts item opens the first one.
export const accountTabs: NavLink[] = [
  { label: "Customers", href: "/customers" },
  { label: "Suppliers", href: "/suppliers" },
  { label: "Cards", href: "/cards" },
  { label: "People", href: "/people" },
];

// More (the "Closing: …" row and Sign out are added by the More sheet). D-043: Reports (Export is
// its Backup all data, at `/export`). D-039: Saved details (bank accounts).
export const moreLinks: NavLink[] = [
  { label: "Months", href: "/months" },
  { label: "Journal", href: "/journal" },
  { label: "Reports", href: "/reports" },
  { label: "Saved details", href: "/saved" },
  { label: "Setup", href: "/setup" },
  { label: "Settings", href: "/settings" },
];

// The money-entry form title for a `?type=` value.
export function moneyEntryLabel(type: string | undefined) {
  return [...newEntries, ...moreEntries].find((e) => e.href === money(type ?? ""))?.label;
}

export type AccountKind = "card" | "customer" | "supplier" | "person";

export type QuickActionGroups = {
  primary: NavLink[];
  more: { newEntry: NavLink[]; reports: NavLink[]; manage: NavLink[] };
};

/**
 * UIDD §4.8 quick actions (D-032, D-038): the forms a detail page opens with its row already
 * picked; each goes back to `from` (this page) after Save or Cancel. Two main buttons, the rest in
 * ⋯ More (New entry · Reports & share · Manage). An inactive row has no new entries; the built-in
 * Walk-in has no due and no Setup edit (D-009, D-023). People, customers and suppliers also have
 * their saved bank accounts in Manage (D-039). Reports & share has the Statement for a period
 * (the Report sheet over this page) and, for a customer who owes, Remind on WhatsApp (D-040).
 */
export function quickActions(
  kind: AccountKind,
  row: { id: string; active: boolean; isSystem?: boolean },
  from: string,
  owes = false,
): QuickActionGroups {
  const id = row.id;
  const key = `${kind}Id`;
  const form = (href: string) => withQuery(href, { [key]: id, from });
  // [main buttons, ⋯ New entry]
  const entries: Record<AccountKind, [NavLink[], NavLink[]]> = {
    card: [
      [
        { label: "Pay card", href: form(money("card_payment")) },
        { label: "Cash-out", href: form(money("card_cash_out")) },
      ],
      [
        { label: "Card fee", href: form(money("card_fee")) },
        { label: "Purchase", href: form("/purchases/new") },
        // D-060: a person's own spending on this card, as a Capital out paid by card.
        { label: "Personal spend", href: form(money("capital_out")) },
      ],
    ],
    customer: row.isSystem
      ? [[{ label: "Sale", href: form("/sales/new") }], []]
      : [
          [
            { label: "Payment in", href: form(money("customer_payment")) },
            { label: "Sale", href: form("/sales/new") },
          ],
          [
            { label: "Profit share", href: form(money("customer_profit_share")) },
            { label: "Discount", href: form(money("customer_discount")) },
          ],
        ],
    supplier: [
      [
        { label: "Supplier payment", href: form(money("supplier_payment")) },
        { label: "Purchase", href: form("/purchases/new") },
      ],
      [],
    ],
    person: [
      [
        { label: "Capital in / out", href: form(money("capital_in")) },
        { label: "Profit paid / reinvested", href: form(money("profit_paid")) },
      ],
      [],
    ],
  };
  const [primary, newEntry] = row.active ? entries[kind] : [[], []];
  return {
    primary,
    more: {
      newEntry,
      reports: [
        // D-045: a person's Investor report (the report page, with them picked).
        ...(kind === "person"
          ? [{ label: "Investor report", href: withQuery("/reports/investor", { person: id }) }]
          : []),
        ...(row.isSystem ? [] : [{ label: "Statement", href: withQuery(from, { report: "1" }) }]),
        ...(kind === "customer" && owes && !row.isSystem
          ? [{ label: "Remind on WhatsApp", href: withQuery(from, { send: "reminder" }) }]
          : []),
        // D-064: a customer's Due trend (not Walk-in).
        ...(kind === "customer" && !row.isSystem
          ? [{ label: "Due trend", href: `/customers/${id}/trend` }]
          : []),
        { label: "See in Journal", href: withQuery("/journal", { who: id }) },
      ],
      manage: row.isSystem
        ? []
        : [
            { label: "Edit", href: withQuery("/setup", { tab: kind, edit: id, from }) },
            // D-039: the saved bank accounts open over this page; a card's details (D-046) too.
            kind === "card"
              ? { label: "Card details", href: withQuery(from, { secret: "1" }) }
              : { label: "Bank accounts", href: withQuery(from, { bank: "1" }) },
          ],
    },
  };
}
