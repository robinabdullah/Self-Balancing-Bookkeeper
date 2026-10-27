"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

// UIDD §1.4, §5: after a save, a toast "Saved · Undo" for 8 seconds, above the bottom tab bar.
// It sits over the tab bar and over an open sheet (D-053): a toast from inside a sheet ("Copied",
// "Couldn't make the PDF") was hidden behind it.
// It lives in the app layout, so it outlives the form that showed it (a full-page form navigates
// away on save). Undo deletes the new entry; a failed Undo says why in a new toast. After a
// customer's Sale, Payment in, Return, Discount or Profit share, Send ▸ opens the send preview
// (D-040).

const SHOW_MS = 8_000;

type Toast = {
  message: string;
  /** Returns null when undone, or the message to show instead. */
  undo?: () => Promise<string | null>;
  /** The send preview's link (D-040). */
  send?: string;
};

const ToastContext = createContext<(toast: Toast) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<(Toast & { n: number }) | null>(null);
  const [undoing, setUndoing] = useState(false);
  const show = useCallback((t: Toast) => setToast((old) => ({ ...t, n: (old?.n ?? 0) + 1 })), []);

  useEffect(() => {
    if (!toast || undoing) return;
    const timer = setTimeout(() => setToast(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast, undoing]);

  async function undo(run: NonNullable<Toast["undo"]>) {
    setUndoing(true);
    const message = await run().catch(() => "Not undone — try again");
    setUndoing(false);
    setToast(message ? (old) => ({ message, n: (old?.n ?? 0) + 1 }) : null);
  }

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-60 flex justify-center px-4 lg:bottom-6"
      >
        {toast && (
          <div
            key={toast.n}
            className="bg-foreground text-background pointer-events-auto flex min-h-12 w-full max-w-sm items-center justify-between gap-3 rounded-lg py-1 pr-1 pl-4 text-sm shadow-lg"
          >
            <span className="mr-auto">{toast.message}</span>
            {toast.undo && (
              <Button
                variant="ghost"
                className="text-background hover:bg-background/10 hover:text-background min-h-11 px-3"
                disabled={undoing}
                onClick={() => undo(toast.undo!)}
              >
                {undoing && <Loader2Icon className="animate-spin" aria-hidden />}
                Undo
              </Button>
            )}
            {toast.send && (
              <Button
                asChild
                variant="ghost"
                className="text-background hover:bg-background/10 hover:text-background min-h-11 px-3"
              >
                <Link href={toast.send} scroll={false} onClick={() => setToast(null)}>
                  Send ▸
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
