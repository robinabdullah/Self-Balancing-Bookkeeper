import type { NextRequest } from "next/server";
import { forwardFile } from "@/api/files";

// D-075, D-080 (UIDD §4.17): the api makes the Expense statement's Excel file
// (`/files/xlsx/expenses`, `?from=&to=` and `?cat=`).
export function GET(request: NextRequest) {
  return forwardFile("GET", `/files/xlsx/expenses${request.nextUrl.search}`);
}
