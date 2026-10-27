import type { Metadata, Viewport } from "next";
import { businessName } from "@/lib/business";
import { getProfile } from "@/server/auth";
import { getBusiness } from "@/server/business";
import "./globals.css";

// D-039: the browser title is the business's name.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: businessName(await getBusiness()),
    description: "Bookkeeping for a two-partner mobile-phone trading business",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// D-037: the theme is the signed-in user's (all devices); the login page uses Night Owl.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = (await getProfile())?.theme ?? "night_owl";
  return (
    <html lang="en" data-theme={theme}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
