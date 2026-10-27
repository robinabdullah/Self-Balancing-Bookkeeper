import { exportFileName } from "@/lib/business";
import { dhakaToday } from "@/lib/dates";
import { requirePartner } from "@/server/auth";
import { getBusiness } from "@/server/business";
import { exportWorkbook } from "@/server/export";

// SRS §10, §11 (task 6.4.1): POST, since every download writes an `export` audit row (D-017).
export async function POST() {
  let userId: string;
  try {
    userId = (await requirePartner()).userId;
  } catch {
    return new Response("Only partners can export", { status: 403 });
  }
  const today = dhakaToday();
  const [body, business] = await Promise.all([exportWorkbook(userId, today), getBusiness()]);
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName(business, today)}"`,
      "Cache-Control": "no-store",
    },
  });
}
