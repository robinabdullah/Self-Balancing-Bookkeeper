import type { ReturnNewView } from "@mbl/api/views/forms.controller";
import { api } from "@/api/client";
import { ReturnForm } from "@/components/return/return-form";
import { safeFrom, withQuery } from "@mbl/domain/href";

// UIDD §4.5: the return modal (fewer than 10 fields); closing it goes home. The bill lines and lots
// it picks from come from the server; the action checks them again on save. `from`: where Save
// and Cancel go back to instead (D-032). N-4.3: one `/views/returns/new` read. D-074: from a
// purchase's or a sale's entry sheet (`kind` + `purchaseId` / `saleId`) the api starts it set to
// it, and a purchase lists only its own lots; an id it can't use is dropped (every lot).
export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const { data, initial, ...options } = await api<ReturnNewView>(
    withQuery("/views/returns/new", {
      kind: one("kind"),
      purchaseId: one("purchaseId"),
      saleId: one("saleId"),
    }),
  );
  return <ReturnForm data={data} {...options} initial={initial} from={safeFrom(params.from)} />;
}
