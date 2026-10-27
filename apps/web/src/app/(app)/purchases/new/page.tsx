import type { PurchaseNewView } from "@mbl/api/views/forms.controller";
import { api } from "@/api/client";
import { PurchaseForm } from "@/components/purchase/purchase-form";
import { cleanPrefill } from "@mbl/domain/prefill";

// UIDD §4.3: a full page (repeatable lines). The pickers come from the Setup lists. From a
// supplier's or card's page (D-032), that supplier / card (paid by Card) starts picked and `from`
// is where Save and Cancel go back to. N-4.3: one `/views/purchases/new` read.
export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, { data, dues, billDates }] = await Promise.all([
    searchParams,
    api<PurchaseNewView>("/views/purchases/new"),
  ]);
  const { prefill, from } = cleanPrefill("purchase", params, data);
  return (
    <PurchaseForm data={data} dues={dues} billDates={billDates} prefill={prefill} from={from} />
  );
}
