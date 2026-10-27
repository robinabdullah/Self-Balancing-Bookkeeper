import { ReportSheet } from "@/components/report/report-sheet";
import { SendOverlay } from "@/components/send/send-overlay";
import type { StatementKind } from "@/lib/accounts";
import { monthOf } from "@/lib/dates";
import { statementXlsxHref, withQuery } from "@/lib/href";
import { rowId } from "@/lib/validation/fields";
import { payAccounts } from "@/server/business";

// D-040: what an account page opens over itself from the URL: the Report sheet (`?report=1`) and
// the send preview (`?send=statement` with a period, `?send=reminder`, `?send=<entry id>` on a
// customer). `base` is the page as it is (tab, period) without them. A customer's or supplier's
// Report sheet also offers the PDF (D-041), with How to pay on customers; D-045: customers,
// suppliers and cards also Download Excel, and a card Share PDF (its card statement).
export async function AccountOverlays({
  kind,
  id,
  base,
  report,
  send,
  range,
  first,
  today,
}: {
  kind: StatementKind;
  id: string;
  base: string;
  report?: string;
  send?: string;
  range: { from: string; to: string } | null;
  /** The oldest entry's date, for the Report sheet's months. */
  first: string | null;
  today: string;
}) {
  const source =
    send === "statement" && range
      ? ({ kind: "statement", account: kind, id, ...range } as const)
      : kind !== "customer"
        ? null
        : send === "reminder"
          ? ({ kind: "reminder", customerId: id } as const)
          : send && rowId.safeParse(send).success
            ? ({ kind: "entry", id: send } as const)
            : null;
  const due = kind === "customer" || kind === "supplier" ? kind : null;
  const pdf =
    report && due
      ? { kind: due, id, accounts: due === "customer" ? await payAccounts() : [] }
      : undefined;
  return (
    <>
      {report && (
        <ReportSheet
          base={base}
          first={first && monthOf(first)}
          today={today}
          pdf={pdf}
          pdfHref={kind === "card" ? withQuery("/pdf/card", { id }) : undefined}
          excelHref={kind === "person" ? undefined : statementXlsxHref(kind, id)}
        />
      )}
      {source && <SendOverlay source={source} closeHref={base} />}
    </>
  );
}
