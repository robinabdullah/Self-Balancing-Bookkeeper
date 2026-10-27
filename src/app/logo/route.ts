import { getLogo } from "@/server/business";

// D-039: the business logo, public (the login page shows it) and cached for a year: the URL
// carries `?v=<hash>`, so a new logo gets a new URL.
export const dynamic = "force-dynamic";

export async function GET() {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec((await getLogo()) ?? "");
  if (!match) return new Response("No logo", { status: 404 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
