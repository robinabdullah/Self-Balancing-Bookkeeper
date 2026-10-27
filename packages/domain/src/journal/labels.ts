import { LABEL } from "../money/types";
import { invoiceLabel, receiptLabel } from "../whatsapp";

// What the Journal calls each entry (UIDD §4.10): the type, with a purchase's "paid by" or a
// return's reason, and the counterparty from the Setup names. Plain module: the list, the detail
// and their filters share it.

/** The fields of a Journal row (the web's `JournalRow`) that the labels read. */
type JournalRow = {
  table: "purchase" | "sale" | "return" | "money";
  id: string;
  type: string;
  detail: string | null;
  docNo: number | null;
  reversesId: string | null;
  customerId: string | null;
  supplierId: string | null;
  cardId: string | null;
  personId: string | null;
};

/** The filter's types, in the New sheet's order (UIDD §3), then the rest. */
export const TYPE_LABEL: Record<string, string> = {
  sale: "Sale",
  purchase: "Purchase",
  customer_return: "Customer return",
  purchase_return: "Purchase return",
  ...LABEL,
  opening: "Opening balance",
};

/** A purchase's source (also a lot's, UIDD §4.7) or a purchase return's reason. */
export const DETAIL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  supplier_credit: "Supplier credit",
  customer_offset: "Customer's due",
  opening: "Opening",
  opening_correction: "Opening correction",
  damaged_lost: "Damaged / lost",
};

/** D-060: a Capital out paid by card (the Journal's detail is its source). */
const byCard = (row: Pick<JournalRow, "type" | "detail">) =>
  row.type === "capital_out" && row.detail === "card";

/** "Purchase · Supplier credit", "Purchase return · Damaged / lost", "Capital out · Card". */
export function entryLabel(row: Pick<JournalRow, "type" | "detail">): string {
  const type = TYPE_LABEL[row.type] ?? row.type;
  const detail =
    (row.type === "purchase" || row.type === "purchase_return" || byCard(row)) &&
    row.detail &&
    DETAIL[row.detail];
  return detail ? `${type} · ${detail}` : type;
}

/**
 * D-060: on a card's statement a Capital out paid by card names the person ("Capital out ·
 * Sumon"); on a person's, the card ("Capital out · Arif · City Amex"). Any other row, or any
 * other statement, reads as `base` names it.
 */
export function otherSide<R extends JournalRow>(
  names: Record<string, string>,
  kind: string,
  base: (row: R) => string = entryLabel,
): (row: R) => string {
  const key = ({ card: "personId", person: "cardId" } as const)[kind as "card" | "person"];
  return (row) => {
    const other = key && byCard(row) ? row[key] : null;
    const name = other && names[other];
    return name ? `${TYPE_LABEL.capital_out} · ${name}` : base(row);
  };
}

/** A sale's "INV-0042" or a customer payment's "MR-0017" (D-042), else null. */
export const docLabel = (row: Pick<JournalRow, "table" | "docNo">) =>
  row.docNo == null
    ? null
    : row.table === "sale"
      ? invoiceLabel(row.docNo)
      : receiptLabel(row.docNo);

/** The label with its number: "Sale INV-0042", "Payment in MR-0017", "Expense". */
export const entryTitle = (row: Pick<JournalRow, "type" | "detail" | "table" | "docNo">) =>
  [entryLabel(row), docLabel(row)].filter(Boolean).join(" ");

/** D-043, D-058: a reversal reads "Reversal of {its original's name}"; any other row its own. */
export function reversalLabel<R extends Pick<JournalRow, "reversesId">>(
  row: R,
  rows: Map<string, R>,
  name: (row: R) => string,
): string {
  const original = row.reversesId ? rows.get(row.reversesId) : undefined;
  return original ? `Reversal of ${name(original)}` : name(row);
}

/** Each Journal row's statement label by id ("Card payment", "Reversal of Card payment"). */
export function entryLabels<R extends JournalRow>(
  journal: R[],
  name: (row: R) => string = entryLabel,
): Map<string, string> {
  const rows = new Map(journal.map((r) => [r.id, r]));
  return new Map(journal.map((r) => [r.id, reversalLabel(r, rows, name)]));
}

/** The entry's counterparties by name: customer, supplier, card, person. */
export function whoOf(row: JournalRow, names: Record<string, string>): string {
  return [row.customerId, row.supplierId, row.cardId, row.personId]
    .flatMap((id) => (id && names[id] ? [names[id]] : []))
    .join(", ");
}

/** Opening items have no form: only the import writes them (SRS §9). */
export const isOpening = (row: JournalRow) => row.type === "opening" || row.detail === "opening";

/** Edit opens the same form as Add (UIDD §3). */
export const editPath = (row: JournalRow) =>
  ({
    purchase: `/purchases/${row.id}/edit`,
    sale: `/sales/${row.id}/edit`,
    return: `/returns/${row.id}/edit`,
    money: `/money/${row.id}/edit`,
  })[row.table];
