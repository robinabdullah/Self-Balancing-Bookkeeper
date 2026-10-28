import { forwardFile } from "@/api/files";

// D-039: the business logo (public: the login page shows it). N-5.3: the api serves it
// (`/files/logo`), cached for a year since its URL carries a hash of it (`/logo?v=`).
export const dynamic = "force-dynamic";

export function GET() {
  return forwardFile("GET", "/files/logo");
}
