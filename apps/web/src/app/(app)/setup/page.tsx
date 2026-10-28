import Link from "next/link";
import { SetupSection } from "@/components/setup/setup-section";
import { type SetupKind, setupKinds } from "@mbl/domain/setup";
import { safeFrom } from "@mbl/domain/href";
import { cn } from "@/lib/utils";
import type { SetupView } from "@mbl/api/views/admin.controller";
import { api } from "@/api/client";

// UIDD §4.11: Setup lists for People, Cards, Customers, Suppliers and Models. `?edit=<id>` opens
// that row's form and `from` is where closing it goes back to (a detail page's Edit, D-032).
// N-4.6: one `/views/setup` read.
const tabs: Record<SetupKind, string> = {
  person: "People",
  card: "Cards",
  customer: "Customers",
  supplier: "Suppliers",
  model: "Models",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; edit?: string; from?: string }>;
}) {
  const { tab, edit, from } = await searchParams;
  const kind = setupKinds.find((k) => k === tab) ?? "person";
  const { data, banks, cardDetails } = await api<SetupView>("/views/setup");
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Setup</h1>
      <nav aria-label="Setup" className="bg-muted mb-4 flex gap-1 overflow-x-auto rounded-lg p-1">
        {setupKinds.map((k) => (
          <Link
            key={k}
            href={`/setup?tab=${k}`}
            aria-current={k === kind ? "page" : undefined}
            className={cn(
              "text-foreground/75 flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm",
              k === kind && "bg-background text-foreground font-medium shadow-sm",
            )}
          >
            {tabs[k]}
          </Link>
        ))}
      </nav>
      <SetupSection
        key={edit}
        kind={kind}
        data={data}
        banks={banks}
        cardDetails={cardDetails}
        edit={edit}
        from={safeFrom(from)}
      />
    </>
  );
}
