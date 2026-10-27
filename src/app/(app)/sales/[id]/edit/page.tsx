import { notFound } from "next/navigation";
import { SaleForm } from "@/components/sale/sale-form";
import { db } from "@/db";
import { safeFrom } from "@/lib/href";
import { editValues } from "@/server/entries";
import { customerDues } from "@/server/books";
import { loadSetup } from "@/server/setup";
import { stockLots } from "@/server/stock";

// UIDD §3, §4.10: Edit from the Journal opens the sale page with the stored bill. The lots count
// this bill's own units as in stock, as the action does (D-004). `from`: where Save and Cancel go
// back to (D-032).
export default async function EditSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const edit = await editValues("sale", id);
  if (!edit) notFound();
  const [data, dues, lots] = await Promise.all([
    loadSetup(),
    customerDues(),
    stockLots(db, { exceptSaleId: id }),
  ]);
  return (
    <SaleForm
      data={data}
      dues={dues}
      lots={lots.filter((l) => l.remaining > 0)}
      lastCustomerId={null}
      edit={edit}
      from={safeFrom(from)}
    />
  );
}
