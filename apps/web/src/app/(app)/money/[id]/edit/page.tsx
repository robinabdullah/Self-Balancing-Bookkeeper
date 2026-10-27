import { notFound } from "next/navigation";
import { MoneyForm } from "@/components/money/money-form";
import { isFormType } from "@/components/money/types";
import { safeFrom } from "@/lib/href";
import { editValues } from "@/server/entries";
import { loadCalendar } from "@/server/action";
import { moneyFormBalances } from "@/server/books";
import { loadSetup } from "@/server/setup";

// UIDD §3, §4.10: Edit from the Journal opens the money modal with the stored entry; its type is
// fixed (D-008). Opening items have no form (only the import writes them, SRS §9). `from`: the
// page the entry was opened on, where Save and Cancel go back to (D-032).
export default async function EditMoneyEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const edit = await editValues("money", id);
  if (!edit || !isFormType(edit.values.type)) notFound();
  const [data, { dues, owed, billDates }, calendar] = await Promise.all([
    loadSetup(),
    moneyFormBalances(),
    loadCalendar(),
  ]);
  return (
    <MoneyForm
      data={data}
      dues={dues}
      owed={owed}
      billDates={billDates}
      type={edit.values.type}
      edit={edit}
      from={safeFrom(from)}
      calendar={calendar}
    />
  );
}
