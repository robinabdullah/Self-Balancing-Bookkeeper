"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
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
import { FormBody, type FormBodyProps } from "./form-body";

/** A bottom sheet on a phone; centred on desktop (D-032). Width is set by the caller. */
export const modalSheet =
  "max-h-[90dvh] gap-0 rounded-t-xl lg:inset-x-0 lg:mx-auto lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2 lg:rounded-xl lg:border";

// UIDD §3 (tasks 3.2.6, 3.3.2): a form with fewer than 10 fields (every money entry, Return,
// Setup, "+ Add new", card bill dates) opens as a modal: a bottom sheet on a phone, centred on
// desktop. Purchase and Sale use `FormPage`. Both share `FormBody`.

type Props = FormBodyProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** false for a page modal: its own URL already makes Back leave it (D-035). */
  history?: boolean;
};

export function FormModal({ open, onOpenChange, title, history, ...body }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} history={history}>
      <SheetContent side="bottom" showCloseButton={false} className={cn(modalSheet, "lg:max-w-md")}>
        <SheetHeader className="flex-row items-center justify-between border-b py-2">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" className="-mr-2 size-11" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        {/* Mounted only while open, so every opening starts from a clean form. */}
        <FormBody {...body} close={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

/**
 * A form that is a page of its own (`/money/new`, `/returns/new`, the edit pages) shown as a modal:
 * closing hides it at once and then goes to `done` (D-032), instead of waiting for that page.
 */
export function usePageModal(done: string) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  useEffect(() => router.prefetch(done), [router, done]);
  const onOpenChange = (next: boolean) => {
    if (next) return;
    setOpen(false);
    router.push(done);
  };
  return { open, onOpenChange, history: false };
}
