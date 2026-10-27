import type { SaleNewView } from "@mbl/api/views/forms.controller";
import { api } from "@/api/client";
import { SaleForm } from "@/components/sale/sale-form";
import { cleanPrefill } from "@mbl/domain/prefill";

// UIDD §4.4: a full page (repeatable lines). The pickers come from the Setup lists; the lots with
// stock feed the "N in stock" counts and the oldest-first preview (the server picks again on save).
// From a customer's page (D-032), `customerId` replaces the last sale's customer and `from` is
// where Save and Cancel go back to. N-4.3: one `/views/sales/new` read.
export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, { data, dues, lots, lastCustomerId }] = await Promise.all([
    searchParams,
    api<SaleNewView>("/views/sales/new"),
  ]);
  const { prefill, from } = cleanPrefill("sale", params, data);
  return (
    <SaleForm
      data={data}
      dues={dues}
      lots={lots}
      lastCustomerId={prefill.customerId ?? lastCustomerId}
      from={from}
    />
  );
}
