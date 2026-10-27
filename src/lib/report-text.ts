import { type ModelRow, modelTotal, piecesAt } from "@/lib/by-model";
import { STATUS } from "@/lib/card-view";
import { positionSections } from "@/lib/dashboard";
import { formatDate, formatMonth } from "@/lib/dates";
import type { InvestorReport } from "@/lib/investor-report";
import { format, sub } from "@/lib/money";
import { type MonthlyPack, topGroups } from "@/lib/monthly-pack";
import { stockTotal } from "@/lib/stock-movement";
import { compose } from "@/lib/whatsapp";

// D-045: the messages of the per-account reports and the Monthly pack, in the sectioned + emoji
// style of the v1.1 plan's samples. Each reads the same model as its screen, PDF and Excel.

const lines = (rows: (string | null | undefined | false)[]) =>
  rows.filter((r) => r != null && r !== false).join("\n");
const signed = (n: number) => (n > 0 ? `+${format(n)}` : format(n));
const pcs = (n: number) => `${n} ${n === 1 ? "pc" : "pcs"}`;
const day = (date: string) => formatDate(date).slice(0, 6);

/** "October 2026"-style period of whole months: "Oct 2026" or "Oct 2026 – Dec 2026". */
export const monthsLabel = (from: string, to: string) =>
  from.slice(0, 7) === to.slice(0, 7)
    ? formatMonth(from)
    : `${formatMonth(from)} – ${formatMonth(to)}`;

export const OPEN_NOTE = "Open month — figures can still change";
export const NOT_ALLOCATED = "not allocated yet (month open)";

/** A card's state in one line: "due ৳X · next 12 Nov", "credit ৳X", "clear ✓" ("clear" in a
 * PDF: its fonts have no ✓). */
export function cardState(
  c: {
    balance: number;
    nextDue: { date: string; amount: number } | null;
    overdue: number;
    status: keyof typeof STATUS;
    remainingEmi: number;
  },
  tick = true,
) {
  const parts = [
    c.balance < 0
      ? `credit ${format(0 - c.balance)}`
      : c.balance === 0
        ? tick
          ? "clear ✓"
          : "clear"
        : `due ${format(c.balance)}`,
    c.nextDue && `next ${day(c.nextDue.date)}`,
    c.overdue > 0 && `overdue ${format(c.overdue)}`,
    c.remainingEmi > 0 && `EMI left ${format(c.remainingEmi)}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** An allocation row: "Cash ৳10,00,000 × 2.5% = ৳25,000", a partner's "Partner share ৳12,000". */
export function allocationText(a: {
  kind: "cash" | "card" | "partner";
  basis?: number | null;
  ratePct?: number | null;
  amount: number;
}) {
  if (a.kind === "partner") return `Partner share ${format(a.amount)}`;
  const part = a.kind === "cash" ? "Cash" : "Cards";
  return a.basis != null && a.ratePct != null
    ? `${part} ${format(a.basis)} × ${a.ratePct}% = ${format(a.amount)}`
    : `${part} ${format(a.amount)}`;
}

/** D-045 Investor report message (to the person; the template adds greeting and sign-off). */
export function investorText(r: InvestorReport, shop?: string | null) {
  const title = r.partner ? "Partner report" : "Investor report";
  const p = r.profit;
  return compose([
    lines([
      shop && `📊 *${shop}*`,
      `*${title} — ${r.person.name}*`,
      `*${monthsLabel(r.from, r.to)}*`,
      r.open && `_${OPEN_NOTE}_`,
    ]),
    lines([
      "💼 *Capital*",
      `- ${day(r.from)}: ${format(r.capital.opening)}`,
      ...r.capital.groups.map((g) => `- ${g.label}: ${signed(g.amount)}`),
      `- *${day(r.to)}: ${format(r.capital.closing)}*`,
    ]),
    r.cards.length > 0 &&
      lines([
        "💳 *Card investment*",
        ...r.cards.map((c) => `- ${c.display}: ${cardState(c)}`),
        `- Card payments made in ${monthsLabel(r.from, r.to)}: ${format(r.cardPayments)}`,
      ]),
    lines([
      "💰 *Your profit*",
      ...r.months.flatMap((m) =>
        m.rows == null
          ? [`- ${formatMonth(m.month)}: ${NOT_ALLOCATED}`]
          : m.rows.length === 0
            ? [`- ${formatMonth(m.month)}: nothing allocated`]
            : m.rows.map((a) => `- ${formatMonth(m.month)}: ${allocationText(a)}`),
      ),
      r.partner?.sharePct != null && `- Share now: ${r.partner.sharePct}%`,
    ]),
    lines([
      "📤 *Profit owed*",
      `- Owed before ${day(r.from)}: ${format(p.before)}`,
      `- Allocated for ${monthsLabel(r.from, r.to)}: ${signed(p.allocated)}`,
      p.later !== 0 && `- Allocated for later months: ${signed(p.later)}`,
      p.other !== 0 && `- Opening & corrections: ${signed(p.other)}`,
      ...p.paid.map((l) => `- Paid on ${day(l.date)}: ${format(0 - l.amount)}`),
      ...p.reinvested.map((l) => `- Reinvested on ${day(l.date)}: ${format(0 - l.amount)}`),
      `- *Profit owed now: ${format(p.owedNow)}*`,
    ]),
    r.partner?.openingDifference != null &&
      `Opening difference: ${format(r.partner.openingDifference)}`,
  ]);
}

/** D-045: a By model block under a statement ("📱 *By model*", then each model and the total). */
export function modelText(title: string, rows: ModelRow[], name: (id: string) => string) {
  if (rows.length === 0) return null;
  const t = modelTotal(rows);
  return lines([
    `📱 *${title}*`,
    ...rows.map((r) => `- ${name(r.id)}: ${piecesAt(r)} · ${format(r.amount)}`),
    `*Total: ${pcs(t.pieces)} · ${format(t.amount)}*`,
  ]);
}

/** D-045: a card statement's additions: the period's bills and split, and the EMI still to come. */
export function cardExtrasText(x: {
  end: string;
  bills: { month: string; dueDate: string; amount: number; paid: number; remaining: number }[];
  split: { charges: number; payments: number; refunds: number };
  emi: { label: string; schedule: { month: string; amount: number; billed: boolean }[] }[];
}) {
  const toCome = x.emi
    .map((p) => ({ ...p, left: p.schedule.filter((s) => !s.billed) }))
    .filter((p) => p.left.length > 0);
  return compose([
    lines([
      `🧾 *Bills* (as on ${formatDate(x.end)})`,
      ...x.bills.map(
        (b) =>
          `- ${formatMonth(b.month)} · due ${day(b.dueDate)}: ${format(b.amount)}, paid ${format(b.paid)}, left ${format(b.remaining)}`,
      ),
      x.bills.length === 0 && "No bills in this period.",
      `Charges: ${format(x.split.charges)} · Card payments: ${format(x.split.payments)} · Refunds & cashback: ${format(x.split.refunds)}`,
    ]),
    toCome.length > 0 &&
      lines([
        "📆 *EMI to come*",
        ...toCome.map(
          (p) =>
            `- ${p.label}: ${p.left.length} × ${format(p.left[0].amount)} from ${formatMonth(p.left[0].month)}`,
        ),
      ]),
  ]);
}

/** D-045 Monthly pack message (a report message: no recipient, greeting or sign-off). */
export function packText(p: MonthlyPack, name: (id: string) => string) {
  const last = p.profit.last != null;
  const vs = (n: number | null) => (last && n != null ? ` (last month ${format(n)})` : "");
  const s = stockTotal(p.stock);
  const dues = (title: string, rows: MonthlyPack["dues"]["customers"]) =>
    rows.length > 0 &&
    lines([
      `*${title}*`,
      ...rows.map((r) => `- ${name(r.id)}: ${format(r.start)} → ${format(r.end)}`),
    ]);
  return compose([
    lines([`📊 *Monthly pack — ${formatMonth(p.month)}*`, !p.closed && `_${OPEN_NOTE}_`]),
    lines([
      "💰 *Profit & loss*",
      ...p.profit.rows
        .filter((r) => r.amount !== 0 || (r.last ?? 0) !== 0)
        .map((r) => `- ${r.label}: ${format(r.amount)}${vs(r.last)}`),
      `*Month profit: ${format(p.profit.total)}*${vs(p.profit.last)}`,
    ]),
    lines([
      `⚖️ *Position on ${formatDate(p.end)}*`,
      ...positionSections(p.position).flatMap((s) => [
        `_${s.title}_`,
        ...s.lines.map((l) => `- ${l.label}: ${format(l.amount)}`),
        ...s.totals.map((t) => `= ${t.label}: ${format(t.amount)}`),
      ]),
      p.position.difference === 0
        ? "✓ The books balance"
        : `✗ Off by ${format(p.position.difference)}`,
    ]),
    lines([
      "👥 *Allocations*",
      p.allocations.rows == null
        ? `Profit ${NOT_ALLOCATED}`
        : p.allocations.rows.map((a) => `- ${name(a.personId)}: ${allocationText(a)}`).join("\n"),
      p.allocations.owed.length > 0 && `Profit owed on ${day(p.end)}:`,
      ...p.allocations.owed.map((o) => `- ${name(o.id)}: ${format(o.amount)}`),
    ]),
    lines([
      `📱 *Sales*: ${pcs(p.sales.pieces)} · ${format(p.sales.sales)} · net profit ${format(p.sales.netProfit)}`,
      ...p.sales.byModel.map((g) => `- ${name(g.id)}: ${piecesAt(g)} · ${format(g.sales)}`),
      p.sales.byCustomer.length > 0 && "Top customers:",
      ...topGroups(p.sales.byCustomer).map((g) => `- ${name(g.id)}: ${format(g.sales)}`),
    ]),
    lines([
      `📦 *Stock*: ${s.opening} → ${s.closing} pcs · ${format(s.value)}`,
      ...p.stock.map((r) => `- ${name(r.id)}: ${r.opening} → ${r.closing} · ${format(r.value)}`),
    ]),
    lines([
      "📒 *Dues*",
      dues("Customers", p.dues.customers),
      dues("Suppliers", p.dues.suppliers),
      p.dues.customers.length + p.dues.suppliers.length === 0 && "No dues.",
    ]),
    (p.cards.bills.length > 0 || p.cards.emi.length > 0) &&
      lines([
        "💳 *Card bills*",
        ...p.cards.bills.map(
          (b) =>
            `- ${name(b.cardId)}: due ${day(b.dueDate)} · ${format(b.remaining)} of ${format(b.amount)}${b.overdue ? " · overdue" : ""}`,
        ),
        ...p.cards.emi.map((e) => `- ${name(e.cardId)}: EMI left ${format(e.remaining)}`),
      ]),
    lines([
      "💵 *Cash flow*",
      `Opening: ${format(p.cash.opening)}`,
      ...p.cash.rows.map(
        (r) =>
          `- ${r.label}: ${[r.in > 0 && `in ${format(r.in)}`, r.out > 0 && `out ${format(r.out)}`].filter(Boolean).join(" · ") || format(sub(r.in, r.out))}`,
      ),
      `*Closing: ${format(p.cash.closing)}*`,
    ]),
  ]);
}
