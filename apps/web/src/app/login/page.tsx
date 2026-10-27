import type { Metadata } from "next";
import { BusinessLogo } from "@/components/shell/business-logo";
import { businessName } from "@mbl/domain/business";
import { getBusiness, logoSrc } from "@/server/business";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `Log in · ${businessName(await getBusiness())}` };
}

// UIDD §4.1: no sign-up link; partner accounts are created by an admin. The business's logo and
// name are shown (D-039).
export default async function LoginPage() {
  const business = await getBusiness();
  const logo = logoSrc(business);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-4">
      <div className="flex items-center gap-3">
        {logo && <BusinessLogo src={logo} size={48} />}
        <h1 className="text-xl font-semibold">{businessName(business)}</h1>
      </div>
      <LoginForm />
    </main>
  );
}
