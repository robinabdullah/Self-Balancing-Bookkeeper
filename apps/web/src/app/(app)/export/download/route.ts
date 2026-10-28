import { forwardFile } from "@/api/files";

// SRS §10, §11 (task 6.4.1): POST, since every download writes an `export` audit row (D-017).
// N-5.2: the api builds the workbook (`/files/export`).
export function POST() {
  return forwardFile("POST", "/files/export");
}
