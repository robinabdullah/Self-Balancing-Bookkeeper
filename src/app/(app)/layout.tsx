import { Toaster } from "@/components/forms/toast";
import { NavBar } from "@/components/shell/nav-bar";
import { TopBar } from "@/components/shell/top-bar";
import { appName } from "@/lib/business";
import { breakdown } from "@/lib/dashboard";
import { formatMonth } from "@/lib/dates";
import { nextToClose } from "@/lib/engine/months";
import { getUser } from "@/lib/supabase/server";
import { loadBooks } from "@/server/books";
import { getBusiness, logoSrc } from "@/server/business";

// UIDD §3: the app shell around every signed-in screen. The toast (UIDD §5) lives here, so a
// form's "Saved · Undo" outlives the form. The balance chip and "Closing: …" (task 4.1.4) come
// from the books on every request (SRS §2).

// Never prerendered: a build must not read the database (SRS §2.1, D-031).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, { data, books, asOf }, business] = await Promise.all([
    getUser(),
    loadBooks(),
    getBusiness(),
  ]);
  const month = nextToClose(data.closed, data.entries[0]?.date ?? null, asOf);
  // "Closing: …" opens that month's close screen (D-032).
  const closing = { label: `Closing: ${formatMonth(month)}`, href: `/months/${month}` };
  return (
    <Toaster>
      <TopBar
        name={appName(business)}
        logo={logoSrc(business)}
        email={user?.email ?? ""}
        closing={closing}
        balance={breakdown(books)}
      />
      <NavBar closing={closing} />
      <div className="lg:pl-56">
        <main className="mx-auto max-w-5xl p-4 pb-24 lg:pb-8">{children}</main>
      </div>
    </Toaster>
  );
}
