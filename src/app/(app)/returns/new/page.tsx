import { ReturnForm } from "@/components/return/return-form";
import { safeFrom } from "@/lib/href";
import { returnOptions } from "@/server/returns";
import { loadSetup } from "@/server/setup";

// UIDD §4.5: the return form is a modal (fewer than 10 fields); closing it goes home. The bill
// lines and lots it picks from come from the server; the action checks them again on save.
// `from`: where Save and Cancel go back to instead (D-032).
export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ from }, data, options] = await Promise.all([searchParams, loadSetup(), returnOptions()]);
  return <ReturnForm data={data} {...options} from={safeFrom(from)} />;
}
