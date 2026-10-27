"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { modalSheet } from "@/components/forms/form-modal";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { BankAccount, Owner } from "@/server/business";
import { BankAccounts } from "./bank-accounts";

/**
 * A sheet over a detail page that its URL holds (`?bank=1`, `?secret=1`), like the entry sheet:
 * Back closes it, and closing returns to `closeHref`.
 */
export function OverlaySheet({
  title,
  description,
  closeHref,
  children,
}: {
  title: string;
  description: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    router.push(closeHref, { scroll: false });
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} history={false}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(modalSheet, "overflow-y-auto lg:max-w-md")}
      >
        <SheetHeader className="flex-row items-center justify-between border-b py-2">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" className="-mr-2 size-11" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

// UIDD §4.8 (D-039): ⋯ → Manage → Bank accounts opens this over the owner's page (`?bank=1`).
export function BankAccountsSheet({
  owner,
  accounts,
  closeHref,
}: {
  owner: Owner;
  accounts: BankAccount[];
  closeHref: string;
}) {
  return (
    <OverlaySheet
      title="Bank accounts"
      description={`${owner.label}'s saved bank accounts`}
      closeHref={closeHref}
    >
      <BankAccounts accounts={accounts} owner={owner} />
    </OverlaySheet>
  );
}
