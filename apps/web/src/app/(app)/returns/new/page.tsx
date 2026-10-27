import type { ReturnNewView } from "@mbl/api/views/forms.controller";
import { api } from "@/api/client";
import { ReturnForm } from "@/components/return/return-form";
import { safeFrom } from "@mbl/domain/href";

// UIDD §4.5: the return form is a modal (fewer than 10 fields); closing it goes home. The bill
// lines and lots it picks from come from the server; the action checks them again on save.
// `from`: where Save and Cancel go back to instead (D-032). N-4.3: one `/views/returns/new` read.
export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ from }, { data, ...options }] = await Promise.all([
    searchParams,
    api<ReturnNewView>("/views/returns/new"),
  ]);
  return <ReturnForm data={data} {...options} from={safeFrom(from)} />;
}
