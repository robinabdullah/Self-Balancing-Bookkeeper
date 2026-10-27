import type { Metadata, Viewport } from "next";
import type { Branding, Me } from "@mbl/api/shell/shell.controller";
import { businessName } from "@mbl/domain/business";
import { api, apiOrNull } from "@/api/client";
import "./globals.css";

// D-039: the browser title is the business's name.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: businessName(await api<Branding>("/branding")),
    description: "Bookkeeping for a two-partner mobile-phone trading business",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// D-037: the theme is the signed-in user's (all devices); the login page uses Night Owl.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = (await apiOrNull<Me>("/me"))?.theme ?? "night_owl";
  return (
    <html lang="en" data-theme={theme}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
