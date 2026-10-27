import type { SaleEditView } from "@mbl/api/views/forms.controller";
import { api } from "@/api/client";
import { SaleForm } from "@/components/sale/sale-form";
import { safeFrom } from "@mbl/domain/href";

// UIDD §3, §4.10: Edit from the Journal opens the sale page with the stored bill. The lots count
// this bill's own units as in stock, as the action does (D-004). `from`: where Save and Cancel go
// back to (D-032). N-4.3: one `/views/sales/:id/edit` read (a missing bill is a 404).
export default async function EditSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const { edit, data, dues, lots } = await api<SaleEditView>(
    `/views/sales/${encodeURIComponent(id)}/edit`,
  );
  return (
    <SaleForm
      data={data}
      dues={dues}
      lots={lots}
      lastCustomerId={null}
      edit={edit}
      from={safeFrom(from)}
    />
  );
}
