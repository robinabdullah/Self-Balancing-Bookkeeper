import { Toaster } from "@/components/forms/toast";
import { NavBar } from "@/components/shell/nav-bar";
import { TopBar } from "@/components/shell/top-bar";
import type { ShellView } from "@mbl/api/shell/shell.controller";
import { api } from "@/api/client";

// UIDD §3: the app shell around every signed-in screen. The toast (UIDD §5) lives here, so a
// form's "Saved · Undo" outlives the form. The balance chip and "Closing: …" (task 4.1.4) come
// from the books on every request (SRS §2), computed by the api (N-2.5).

// Never prerendered: a build must not read the database (SRS §2.1, D-031).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { name, logo, email, closing, balance } = await api<ShellView>("/views/shell");
  return (
    <Toaster>
      <TopBar name={name} logo={logo} email={email} closing={closing} balance={balance} />
      <NavBar closing={closing} />
      <div className="lg:pl-56">
        <main className="mx-auto max-w-5xl p-4 pb-24 lg:pb-8">{children}</main>
      </div>
    </Toaster>
  );
}
