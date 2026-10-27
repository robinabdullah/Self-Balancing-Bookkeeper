"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { modalSheet } from "@/components/forms/form-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { signOut } from "@/server/actions/auth";
import { type NavLink, moreEntries, moreLinks, newEntries } from "./nav";

const rowClass = "flex min-h-11 w-full items-center rounded-lg px-3 text-base hover:bg-muted";

export type SheetProps = { trigger: React.ReactNode; triggerClass: string };

// UIDD §1: on a phone, sheets slide up from the bottom; on desktop the same sheet is centred.
export function NavSheet({
  trigger,
  triggerClass,
  title,
  description,
  children,
}: SheetProps & { title: string; description: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false); // controlled, so Back closes it (D-035)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={triggerClass}>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          modalSheet,
          "max-h-[85dvh] gap-4 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] lg:max-w-md",
        )}
      >
        <SheetHeader className="flex-row items-center justify-between pb-0">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" className="size-11" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function SheetLinks({ links }: { links: NavLink[] }) {
  return links.map((link) => (
    <SheetClose key={link.label} asChild>
      <SheetLink href={link.href} className={rowClass}>
        {link.label}
      </SheetLink>
    </SheetClose>
  ));
}

// UIDD §3: the New action sheet. Tapping a type opens its form with the type already set.
export function NewSheet(props: SheetProps) {
  const [showMore, setShowMore] = useState(false);
  return (
    <NavSheet {...props} title="New" description="Choose what to record">
      <SheetLinks links={newEntries} />
      {showMore ? (
        <SheetLinks links={moreEntries} />
      ) : (
        <button type="button" className={rowClass} onClick={() => setShowMore(true)}>
          More…
        </button>
      )}
    </NavSheet>
  );
}

// UIDD §3: More: Months, Journal, Reports, Saved details, Setup, Settings, "Closing: …", Sign out
// (D-037, D-039).
export function MoreSheet({
  closing,
  ...props
}: SheetProps & { closing: { label: string; href: string } }) {
  return (
    <NavSheet {...props} title="More" description="Other screens and settings">
      <SheetLinks links={[...moreLinks, closing]} />
      <form action={signOut} className="border-t pt-2">
        <button type="submit" className={rowClass}>
          Sign out
        </button>
      </form>
    </NavSheet>
  );
}
