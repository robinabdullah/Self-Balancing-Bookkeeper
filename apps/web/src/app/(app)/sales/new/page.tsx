import { SaleForm } from "@/components/sale/sale-form";
import { cleanPrefill } from "@/lib/prefill";
import { customerDues } from "@/server/books";
import { loadSetup } from "@/server/setup";
import { lastSaleCustomerId, stockLots } from "@/server/stock";

// UIDD §4.4: a full page (repeatable lines). The pickers come from the Setup lists; the lots with
// stock feed the "N in stock" counts and the oldest-first preview (the server picks again on save).
// From a customer's page (D-032), `customerId` replaces the last sale's customer and `from` is
// where Save and Cancel go back to.
export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, data, dues, lots, lastCustomerId] = await Promise.all([
    searchParams,
    loadSetup(),
    customerDues(),
    stockLots(),
    lastSaleCustomerId(),
  ]);
  const { prefill, from } = cleanPrefill("sale", params, data);
  return (
    <SaleForm
      data={data}
      dues={dues}
      lots={lots.filter((l) => l.remaining > 0)}
      lastCustomerId={prefill.customerId ?? lastCustomerId}
      from={from}
    />
  );
}
