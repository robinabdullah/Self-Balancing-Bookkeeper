// N-1.1: every route the harness dumps. Pages with their key search-param variants (filters,
// the Report sheet `?report=1`, the send preview `?send=`, the bank and entry overlays, tabs),
// then the PDF and Excel files. Ids come from the parity seed.
import { ids } from "./seed";

export type Refs = Record<string, string>;

const CHARTS = [
  "net-profit",
  "sales",
  "expenses",
  "business-value",
  "cash",
  "card-debt",
  "profit-shares",
  "customers-owe",
  "given-collected",
  "top-customers",
  "stock-age",
  "top-models",
];

const SEP = "from=2026-09-01&to=2026-09-30";
const ALL = "from=2026-08-01&to=2026-10-20";

export function pages(r: Refs): string[] {
  const customer = `/customers/${ids.rahman}`;
  return [
    "/",
    `/?entry=${r.invoice}`,
    "/journal",
    "/journal?type=sale",
    "/journal?period=last",
    "/journal?period=2026-08",
    `/journal?period=custom&${SEP}`,
    `/journal?who=${ids.rahman}`,
    "/journal?q=Star",
    `/journal?entry=${r.reversal}`,
    "/stock",
    "/cards",
    `/cards/${ids.visa}`,
    `/cards/${ids.visa}?${SEP}`,
    `/cards/${ids.visa}?report=1`,
    `/cards/${ids.amex}`,
    "/customers",
    customer,
    `${customer}?tab=bills`,
    `${customer}?${SEP}`,
    `${customer}?report=1`,
    `${customer}?bank=1`,
    `${customer}?send=reminder`,
    `${customer}?send=statement&${SEP}`,
    `${customer}?send=${r.invoice}`,
    `${customer}?entry=${r.receipt}`,
    `${customer}/trend`,
    `/customers/${ids.star}`,
    "/suppliers",
    `/suppliers/${ids.alpha}`,
    `/suppliers/${ids.alpha}?report=1`,
    `/suppliers/${ids.beta}`,
    "/people",
    `/people/${ids.arif}`,
    `/people/${ids.nadim}?report=1`,
    `/people/${ids.kamal}`,
    "/months",
    "/months/2026-08",
    "/months/2026-09",
    "/months/2026-10",
    "/money/new",
    "/money/new?type=expense",
    `/money/new?type=customer_payment&customerId=${ids.rahman}`,
    `/money/${r.expense}/edit`,
    `/money/${r.receipt}/edit`,
    "/sales/new",
    `/sales/new?customerId=${ids.rahman}`,
    `/sales/${r.sale}/edit`,
    "/purchases/new",
    `/purchases/${r.purchase}/edit`,
    `/purchases/${r.cashPurchase}/edit`,
    "/returns/new",
    `/returns/${r.return}/edit`,
    "/reports",
    "/reports/cash",
    "/reports/cash?day=2026-10-15",
    "/reports/cash?report=1",
    "/reports/charts",
    "/reports/charts?tab=money",
    "/reports/charts?tab=customers",
    "/reports/charts?tab=stock",
    ...CHARTS.map((c) => `/reports/charts/${c}`),
    "/reports/charts/expenses?cat=salary",
    "/reports/investor",
    `/reports/investor?person=${ids.kamal}`,
    `/reports/investor?person=${ids.kamal}&report=1`,
    "/reports/pack",
    "/reports/pack?month=2026-09",
    "/reports/sales",
    `/reports/sales?${ALL}`,
    "/reports/sales?report=1",
    "/saved",
    "/saved?tab=bank",
    "/setup",
    "/setup?tab=card",
    "/setup?tab=customer",
    "/setup?tab=supplier",
    "/setup?tab=model",
    `/setup?tab=customer&edit=${ids.rahman}`,
    "/settings",
    "/export",
  ];
}

/** The PDFs (text via unpdf), with the business's own bank account on the customer ones. */
export function pdfs(r: Refs): string[] {
  const pay = `pay=${ids.bankOwn}`;
  return [
    `/pdf/invoice?id=${r.invoice}&${pay}`,
    `/pdf/invoice?id=${r.sale}`,
    `/pdf/receipt?id=${r.receipt}&${pay}`,
    `/pdf/statement?kind=customer&id=${ids.rahman}&${ALL}&${pay}`,
    `/pdf/statement?kind=supplier&id=${ids.alpha}&${ALL}`,
    `/pdf/card?id=${ids.visa}&${ALL}`,
    `/pdf/investor?person=${ids.kamal}&${ALL}`,
    `/pdf/sales?${ALL}`,
    "/pdf/pack?month=2026-09",
  ];
}

/** The Excel files (every cell's text, sheet by sheet). */
export function workbooks(): string[] {
  return [
    `/reports/statement/xlsx?kind=customer&id=${ids.rahman}&${ALL}`,
    `/reports/statement/xlsx?kind=supplier&id=${ids.alpha}&${ALL}`,
    `/reports/investor/xlsx?person=${ids.kamal}&${ALL}`,
    `/reports/sales/xlsx?${ALL}`,
    "/reports/pack/xlsx?month=2026-09",
  ];
}

/** A route as a file name: `/customers/<id>?tab=bills` → `customers_<id>_tab=bills`. */
export const slug = (route: string) =>
  route === "/" ? "home" : route.replace(/^\//, "").replace(/[/?&]/g, "_").replace(/[<>:"|*]/g, "");
