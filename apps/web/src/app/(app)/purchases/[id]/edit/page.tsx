import { notFound } from "next/navigation";
import { PurchaseForm } from "@/components/purchase/purchase-form";
import { safeFrom } from "@mbl/domain/href";
import { editValues } from "@/server/entries";
import { customerDues, loadBooks } from "@/server/books";
import { loadSetup } from "@/server/setup";

// UIDD §3, §4.10: Edit from the Journal opens the purchase page with the stored values. `from`:
// where Save and Cancel go back to (D-032).
export default async function EditPurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const edit = await editValues("purchase", id);
  if (!edit) notFound();
  const [data, dues, { data: books }] = await Promise.all([
    loadSetup(),
    customerDues(),
    loadBooks(),
  ]);
  return (
    <PurchaseForm
      data={data}
      dues={dues}
      billDates={books.billDates}
      edit={edit}
      from={safeFrom(from)}
    />
  );
}
