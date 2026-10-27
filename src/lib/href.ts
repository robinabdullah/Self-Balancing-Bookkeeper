// In-app links (D-032): entry details open over the current page (`?entry=<id>`), and forms go
// back to the page they were opened from (`?from=<path>`). Plain functions, safe on the client.

/** `href` with `params` set (a null/empty value removes that param); other params are kept. */
export function withQuery(href: string, params: Record<string, string | null | undefined>) {
  const [path, q = ""] = href.split("?");
  const sp = new URLSearchParams(q);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") sp.delete(key);
    else sp.set(key, value);
  }
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/** D-040: the send preview for a customer's entry, over their page (null without a customer). */
export const sendHref = (customerId: unknown, id: string) =>
  typeof customerId === "string" && customerId
    ? withQuery(`/customers/${customerId}`, { send: id })
    : null;

/** D-041: a customer's or supplier's due statement PDF; `pay` adds How to pay (customers). */
export const statementPdfHref = (
  kind: "customer" | "supplier",
  id: string,
  from: string,
  to: string,
  pay: string[] = [],
) => withQuery("/pdf/statement", { kind, id, from, to, pay: pay.join(",") });

/** D-042: a sale's invoice / a customer payment's money receipt PDF; `pay` adds How to pay. */
export const invoicePdfHref = (id: string, pay: string[] = []) =>
  withQuery("/pdf/invoice", { id, pay: pay.join(",") });
export const receiptPdfHref = (id: string, pay: string[] = []) =>
  withQuery("/pdf/receipt", { id, pay: pay.join(",") });

/** D-043: the Sales report's PDF and Excel (the Report sheet adds `from`/`to`). */
export const salesPdfHref = "/pdf/sales";
export const salesXlsxHref = "/reports/sales/xlsx";

/** D-045: the card statement PDF and the Investor report PDF for a period. */
export const cardPdfHref = (id: string, from: string, to: string) =>
  withQuery("/pdf/card", { id, from, to });
export const investorPdfHref = (person: string, from: string, to: string) =>
  withQuery("/pdf/investor", { person, from, to });

/** D-045: the Report sheet's routes (it adds `from`/`to`, or `month` for the pack). */
export const statementXlsxHref = (kind: string, id: string) =>
  withQuery("/reports/statement/xlsx", { kind, id });
export const investorRoutes = (person: string) => ({
  pdf: withQuery("/pdf/investor", { person }),
  excel: withQuery("/reports/investor/xlsx", { person }),
});
export const packPdfHref = "/pdf/pack";
export const packXlsxHref = "/reports/pack/xlsx";

/** The page `base` with entry `id`'s detail open over it. */
export const entryHref = (base: string, id: string) => withQuery(base, { entry: id });

/**
 * A `from` value only if it is a path in this app ("/x"). Rejects "//x" and "/\x" (browsers read
 * both as another host), full URLs, arrays and overlong values, so `from` can't redirect away.
 */
export function safeFrom(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}
