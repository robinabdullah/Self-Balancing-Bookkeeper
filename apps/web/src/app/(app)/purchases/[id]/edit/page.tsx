import type { PurchaseEditView } from "@mbl/api/views/forms.controller";
import { api } from "@/api/client";
import { PurchaseForm } from "@/components/purchase/purchase-form";
import { safeFrom } from "@mbl/domain/href";

// UIDD §3, §4.10: Edit from the Journal opens the purchase page with the stored values. `from`:
// where Save and Cancel go back to (D-032). N-4.3: one `/views/purchases/:id/edit` read (a missing
// purchase is a 404).
export default async function EditPurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const { edit, data, dues, billDates } = await api<PurchaseEditView>(
    `/views/purchases/${encodeURIComponent(id)}/edit`,
  );
  return (
    <PurchaseForm data={data} dues={dues} billDates={billDates} edit={edit} from={safeFrom(from)} />
  );
}
