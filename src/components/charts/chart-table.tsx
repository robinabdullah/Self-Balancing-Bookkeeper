import type { ReactNode } from "react";
import Link from "next/link";
import { rowClass, rowLinkClass } from "@/components/tables/row-link";
import { cn } from "@/lib/utils";

// D-064 (UIDD §4.17): the exact values under a detail chart: a list on a phone, a table on
// desktop (beside a narrow chart, below a wide one; the page places it). A row may open a page
// (a month, a customer's Due trend).

export type TableColumn = { key: string; label: string; numeric?: boolean };
export type TableRow = { key: string; href?: string; cells: Record<string, ReactNode> };

export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: TableColumn[];
  rows: TableRow[];
}) {
  const [first, ...rest] = columns;
  return (
    <>
      <ul aria-label={caption} className="divide-y rounded-lg border lg:hidden">
        {rows.map((row) => {
          const body = (
            <>
              <span className="font-medium">{row.cells[first.key]}</span>
              {rest.map((c) => (
                <span key={c.key} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="tabular-nums">{row.cells[c.key]}</span>
                </span>
              ))}
            </>
          );
          const item = "flex min-h-11 flex-col gap-0.5 px-3 py-2";
          return (
            <li key={row.key}>
              {row.href ? (
                <Link href={row.href} className={cn(item, "hover:bg-muted/40")}>
                  {body}
                </Link>
              ) : (
                <div className={item}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <table className="hidden w-full text-sm lg:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("px-2 py-2 font-medium", c.numeric ? "text-right" : "text-left")}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={cn("border-b", row.href && rowClass)}>
              {columns.map((c, i) => (
                <td key={c.key} className={cn("px-2 py-2", c.numeric && "text-right tabular-nums")}>
                  {i === 0 && row.href ? (
                    <Link href={row.href} className={cn("text-primary", rowLinkClass)}>
                      {row.cells[c.key]}
                    </Link>
                  ) : (
                    row.cells[c.key]
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
