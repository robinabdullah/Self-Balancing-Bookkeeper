import { StockList } from "@/components/stock/stock-list";
import { setupNames } from "@mbl/domain/setup";
import { loadSetup } from "@/server/setup";
import { stockLots } from "@/server/stock";

// UIDD §4.7 (task 4.2): every lot with what it has left (SRS §4), grouped by model.
export default async function StockPage() {
  const [lots, setup] = await Promise.all([stockLots(), loadSetup()]);
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Stock</h1>
      <StockList lots={lots} names={setupNames(setup)} />
    </>
  );
}
