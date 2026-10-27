import type { ReturnEditView } from "@mbl/api/views/forms.controller";
import { api } from "@/api/client";
import { ReturnForm } from "@/components/return/return-form";
import { safeFrom } from "@mbl/domain/href";

// UIDD §3, §4.10: Edit from the Journal opens the return modal with the stored return. Its own
// units count as still to return / in stock, as the action does. `from`: where Save and Cancel go
// back to (D-032). N-4.3: one `/views/returns/:id/edit` read (a missing return is a 404).
export default async function EditReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const { edit, data, ...options } = await api<ReturnEditView>(
    `/views/returns/${encodeURIComponent(id)}/edit`,
  );
  return <ReturnForm data={data} {...options} edit={edit} from={safeFrom(from)} />;
}
