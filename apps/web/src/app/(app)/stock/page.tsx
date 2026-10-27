import type { StockView } from "@mbl/api/views/lists.controller";
import { api } from "@/api/client";
import { StockList } from "@/components/stock/stock-list";

// UIDD §4.7 (task 4.2): every lot with what it has left (SRS §4), grouped by model. N-4.4: one
// `/views/stock` read.
export default async function StockPage() {
  const { lots, names } = await api<StockView>("/views/stock");
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Stock</h1>
      <StockList lots={lots} names={names} />
    </>
  );
}
