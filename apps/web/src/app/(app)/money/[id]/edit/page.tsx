import { notFound } from "next/navigation";
import type { MoneyEditView } from "@mbl/api/views/forms.controller";
import { api } from "@/api/client";
import { MoneyForm } from "@/components/money/money-form";
import { isFormType } from "@mbl/domain/money/types";
import { safeFrom } from "@mbl/domain/href";

// UIDD §3, §4.10: Edit from the Journal opens the money modal with the stored entry; its type is
// fixed (D-008). Opening items have no form (only the import writes them, SRS §9). `from`: the
// page the entry was opened on, where Save and Cancel go back to (D-032). N-4.3: one
// `/views/money/:id/edit` read (a missing entry is a 404).
export default async function EditMoneyEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const { edit, data, dues, owed, billDates, calendar } = await api<MoneyEditView>(
    `/views/money/${encodeURIComponent(id)}/edit`,
  );
  if (!isFormType(edit.values.type)) notFound();
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
