import { MoneyForm } from "@/components/money/money-form";
import { isFormType } from "@mbl/domain/money/types";
import { cleanPrefill } from "@mbl/domain/prefill";
import { loadCalendar } from "@/server/action";
import { moneyFormBalances } from "@/server/books";
import { loadSetup } from "@/server/setup";

// UIDD §4.6: one modal for every single-amount type; `?type=` sets the type (none or an unknown
// one → the type picker). A page's quick action (D-032) adds the row to pick (`customerId`,
// `supplierId`, `cardId`, `personId`), an `amount` and `from` (where Save and Cancel go back to);
// `cleanPrefill` drops anything the form can't use. `supplierId` also comes from the purchase
// form's supplier-credit tip.
export default async function NewMoneyEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, data, { dues, owed, billDates }, calendar] = await Promise.all([
    searchParams,
    loadSetup(),
    moneyFormBalances(),
    loadCalendar(),
  ]);
  const type = typeof params.type === "string" && isFormType(params.type) ? params.type : null;
  const { prefill, from } = cleanPrefill(type, params, data);
  return (
    <MoneyForm
      data={data}
      dues={dues}
      owed={owed}
      billDates={billDates}
      type={type}
      prefill={prefill}
      from={from}
      calendar={calendar}
    />
  );
}
