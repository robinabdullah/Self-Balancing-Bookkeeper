import { notFound } from "next/navigation";
import { ReturnForm } from "@/components/return/return-form";
import { safeFrom } from "@mbl/domain/href";
import { editValues } from "@/server/entries";
import { returnOptions } from "@/server/returns";
import { loadSetup } from "@/server/setup";

// UIDD §3, §4.10: Edit from the Journal opens the return modal with the stored return. Its own
// units count as still to return / in stock, as the action does. `from`: where Save and Cancel go
// back to (D-032).
export default async function EditReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const edit = await editValues("return", id);
  if (!edit) notFound();
  const [data, options] = await Promise.all([loadSetup(), returnOptions(id)]);
  return <ReturnForm data={data} {...options} edit={edit} from={safeFrom(from)} />;
}
