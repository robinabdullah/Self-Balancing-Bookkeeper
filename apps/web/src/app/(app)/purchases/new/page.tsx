import { PurchaseForm } from "@/components/purchase/purchase-form";
import { cleanPrefill } from "@mbl/domain/prefill";
import { customerDues, loadBooks } from "@/server/books";
import { loadSetup } from "@/server/setup";

// UIDD §4.3: a full page (repeatable lines). The pickers come from the Setup lists. From a
// supplier's or card's page (D-032), that supplier / card (paid by Card) starts picked and `from`
// is where Save and Cancel go back to.
export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, data, dues, { data: books }] = await Promise.all([
    searchParams,
    loadSetup(),
    customerDues(),
    loadBooks(), // the same request's books as `customerDues` (cached)
  ]);
  const { prefill, from } = cleanPrefill("purchase", params, data);
  return (
    <PurchaseForm
      data={data}
      dues={dues}
      billDates={books.billDates}
      prefill={prefill}
      from={from}
    />
  );
}
