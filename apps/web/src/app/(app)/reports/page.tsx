import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

// D-043, D-045, D-064 (UIDD §4.17): the Reports list, Charts first. Backup all data is the Export
// page, which keeps its `/export` address.
const REPORTS = [
  {
    label: "Charts",
    hint: "Profit, expenses, dues and more over time",
    href: "/reports/charts",
  },
  { label: "Cash book", hint: "Each day's cash in and out", href: "/reports/cash" },
  {
    label: "Sales report",
    hint: "Sales, profit, by model and by customer",
    href: "/reports/sales",
  },
  {
    label: "Monthly pack",
    hint: "A month for the partners: profit, position, stock, dues, cards, cash",
    href: "/reports/pack",
  },
  {
    label: "Investor report",
    hint: "Each investor's or partner's capital, cards and profit",
    href: "/reports/investor",
  },
  { label: "Backup all data (.xlsx)", hint: "Every table, for Excel", href: "/export" },
];

export default function ReportsPage() {
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Reports</h1>
      <ul aria-label="Reports" className="divide-y rounded-lg border">
        {REPORTS.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="hover:bg-muted/40 flex min-h-11 items-center justify-between gap-3 px-3 py-2"
            >
              <span className="flex flex-col">
                <span className="font-medium">{r.label}</span>
                <span className="text-muted-foreground text-sm">{r.hint}</span>
              </span>
              <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
