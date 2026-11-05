"use client";

import { useState } from "react";
import { BellIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SheetLink } from "@/components/ui/use-back-close";
import { type Alert, LEVEL, LEVELS, badgeCount } from "@mbl/domain/alert-level";
import { alertText } from "@mbl/domain/help-text";
import { cn } from "@/lib/utils";

// UIDD §3 (D-079, D-081; rules in SRS §15): the 🔔 in the top bar. The badge counts Urgent + Soon
// (red when any is Urgent); a tap opens the Alerts sheet: a bottom sheet on a phone, docked right on
// a desktop; Back closes it, and a row's link replaces it in history. No dismiss: an alert goes
// when its cause is fixed.

/** On a desktop the bottom sheet docks to the right edge, full height (UIDD §3). */
const side =
  "lg:data-[side=bottom]:top-0 lg:data-[side=bottom]:left-auto lg:data-[side=bottom]:h-full lg:data-[side=bottom]:max-h-none lg:data-[side=bottom]:w-96 lg:data-[side=bottom]:rounded-none lg:data-[side=bottom]:border-t-0 lg:data-[side=bottom]:border-l";

export function AlertsBell({ alerts, noExpiryCards }: { alerts: Alert[]; noExpiryCards: number }) {
  const [open, setOpen] = useState(false); // controlled, so Back closes it (D-035)
  const count = badgeCount(alerts);
  const urgent = alerts.some((a) => a.level === "urgent");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="relative size-11 shrink-0"
          aria-label={
            count
              ? `Alerts, ${count} ${count === 1 ? "needs" : "need"} attention`
              : "Alerts, all clear"
          }
        >
          <BellIcon className="size-5" aria-hidden />
          {count > 0 && (
            <span
              aria-hidden
              data-testid="alerts-badge"
              className={cn(
                "absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[11px] leading-none font-semibold",
                LEVEL[urgent ? "urgent" : "soon"].tone,
              )}
            >
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "max-h-[85dvh] gap-4 overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]",
          side,
        )}
      >
        <SheetHeader className="flex-row items-center justify-between pb-0">
          <SheetTitle className="text-lg">Alerts</SheetTitle>
          <SheetDescription className="sr-only">What needs attention</SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" className="size-11" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          {alerts.length === 0 && <p className="text-muted-foreground">{alertText.allClear}</p>}
          {LEVELS.map((level) => {
            const rows = alerts.filter((a) => a.level === level);
            if (!rows.length) return null;
            const heading = `alerts-${level}`;
            return (
              <section key={level} aria-labelledby={heading} className="flex flex-col gap-1">
                <h3 id={heading} className="text-muted-foreground text-sm font-medium">
                  {LEVEL[level].label} · {rows.length}
                </h3>
                <ul aria-labelledby={heading} className="divide-y rounded-lg border">
                  {rows.map((a) => (
                    <li key={`${a.kind}-${a.href}`}>
                      <SheetClose asChild>
                        <SheetLink
                          href={a.href}
                          className="hover:bg-muted/40 flex min-h-11 gap-3 px-3 py-2"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "mt-1.5 size-2.5 shrink-0 rounded-full",
                              LEVEL[level].dot,
                            )}
                          />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm">
                              <span className="text-muted-foreground">{LEVEL[level].label} · </span>
                              <span className="font-semibold">{a.title}</span>
                            </span>
                            <span className="text-muted-foreground text-sm">{a.detail}</span>
                          </span>
                        </SheetLink>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {noExpiryCards > 0 && (
            <SheetClose asChild>
              <SheetLink
                href="/saved"
                className="text-muted-foreground hover:text-foreground flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
              >
                {alertText.noExpiry(noExpiryCards)}
              </SheetLink>
            </SheetClose>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
