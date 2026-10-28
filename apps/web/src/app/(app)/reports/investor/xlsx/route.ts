import type { NextRequest } from "next/server";
import { forwardFile } from "@/api/files";

// N-5.2 (D-043, D-045): the api makes this report's Excel file (`/files/xlsx/investor`).
export function GET(request: NextRequest) {
  return forwardFile("GET", `/files/xlsx/investor${request.nextUrl.search}`);
}
