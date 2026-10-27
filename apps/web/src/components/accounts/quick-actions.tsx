import Link from "next/link";
import { EllipsisIcon } from "lucide-react";
import { type AccountKind, quickActions } from "@/components/shell/nav";
import { NavSheet, SheetLinks } from "@/components/shell/nav-sheets";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// UIDD §4.8 (D-032, D-038): a detail page's 2 main buttons + ⋯ More (New entry · Reports & share ·
// Manage); each form opens with this row picked and comes back here after Save or Cancel.
export function QuickActions({
  kind,
  row,
  from,
  owes,
}: {
  kind: AccountKind;
  row: { id: string; active: boolean; isSystem?: boolean };
  from: string;
  /** A customer who owes gets Remind on WhatsApp (D-040). */
  owes?: boolean;
}) {
  const { primary, more } = quickActions(kind, row, from, owes);
  const groups: [string, typeof primary][] = [
    ["New entry", more.newEntry],
    ["Reports & share", more.reports],
    ["Manage", more.manage],
  ];
  return (
    <nav aria-label="Quick actions" className="mt-3 flex flex-wrap gap-2">
      {primary.map((a) => (
        <Button key={a.label} asChild variant="outline" className="min-h-11 px-3">
          <Link href={a.href}>{a.label}</Link>
        </Button>
      ))}
      <NavSheet
        trigger={
          <>
            <EllipsisIcon aria-hidden /> More
          </>
        }
        triggerClass={cn(buttonVariants({ variant: "outline" }), "min-h-11 px-3")}
        title="More actions"
        description="Other entries, reports and settings for this account"
      >
        {groups
          .filter(([, links]) => links.length > 0)
          .map(([heading, links]) => (
            <section key={heading} aria-label={heading} className="flex flex-col">
              <h3 className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-medium uppercase">
                {heading}
              </h3>
              <SheetLinks links={links} />
            </section>
          ))}
      </NavSheet>
    </nav>
  );
}
