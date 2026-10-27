"use client";

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetLink } from "@/components/ui/use-back-close";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ConfirmSheet } from "@/lib/confirms";
import { formatStamp } from "@/lib/dates";
import type { EffectRow } from "@/lib/effect-rows";
import type { Errors } from "@/lib/guards";
import type { AboutForm } from "@/lib/help-text";
import { cn } from "@/lib/utils";
import type { Result } from "@/server/action";
import { EffectRows } from "./effect-rows";
import { FormChanged, FormErrors, FormInitial } from "./field";
import { NotesBox } from "./notes-box";
import { useToast } from "./toast";

// UIDD §1, §3, §5 (tasks 3.2.6, 3.3): the body every create/edit form shares, in a modal
// (`FormModal`) or a full page (`FormPage`). The fields, the notes box (About + What this will
// do), a sticky footer (total, Cancel, Save with a spinner), inline errors, "Not saved — tap Save
// again", the duplicate dialog (View it · Save anyway · Cancel) and the "Saved · Undo" toast.

export const NOT_SAVED = "Not saved — tap Save again";
export const NOT_UNDONE = "Not undone — try again";

/** The form's current text values, as a server action receives them. */
export type Fields = Record<string, unknown>;
/** The current values (with `meta`) for parts of a form that preview from them (a sale line). */
export const FormValues = createContext<Fields | null>(null);
type Ok = Extract<Result, { status: "ok" }>;
type Duplicate = Extract<Result, { status: "duplicate" }>;

export type FormBodyProps = {
  about?: AboutForm;
  /** Sent with the fields: the row id and, on edit, the `updatedAt` the form saw. */
  meta: Record<string, string>;
  /** Edit: the stored values by field name, the fields' starting values. */
  initial?: Record<string, string>;
  submit: (input: Fields) => Promise<Result>;
  submitLabel?: string;
  /** The toast after a save ("Deleted" for a delete confirm). */
  savedMessage?: string;
  /** "What this will do" from the current values (`previewEntry`); null while incomplete. */
  preview?: (fields: Fields) => EffectRow[] | null;
  /** D-060, D-061: what Save will do, confirmed in a sheet first (Save · Back); null: none. */
  confirm?: (fields: Fields) => ConfirmSheet | null;
  /** The footer total (preview), e.g. a purchase's "Total ৳50,730". */
  total?: (fields: Fields) => string | null;
  /** New entries: the toast's Undo deletes the saved row (UIDD §1.4). */
  undo?: (saved: { id: string; updatedAt: string }) => Promise<Result>;
  onSaved?: (saved: Ok) => void;
  /** The toast's Send ▸ link for this save, from the values sent (D-040); null: none. */
  send?: (saved: Ok, input: Fields) => string | null;
  /** Extra controls under a whole-form error (e.g. "Deactivate instead"). */
  formErrorAction?: (message: string, close: () => void) => React.ReactNode;
  children?: React.ReactNode;
};

const NONE: Record<string, string> = {};

/** Undo's result → null (done) or the toast message to show instead. */
const undone = (r: Result) =>
  r.status === "ok" ? null : r.status === "conflict" ? r.message : NOT_UNDONE;

export function FormBody({
  about,
  meta,
  initial,
  submit,
  submitLabel = "Save",
  savedMessage = "Saved",
  preview,
  confirm,
  total,
  undo,
  onSaved,
  send,
  formErrorAction,
  children,
  close,
  page = false,
}: FormBodyProps & { close: () => void; page?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [confirming, setConfirming] = useState<ConfirmSheet | null>(null);
  const toast = useToast();

  const read = useCallback(() => {
    if (ref.current) setFields(Object.fromEntries(new FormData(ref.current)));
  }, []);
  useEffect(read, [read]); // the first values, after mount

  async function save(confirmDuplicate: boolean) {
    if (pending || !ref.current) return;
    const input = { ...Object.fromEntries(new FormData(ref.current)), ...meta };
    setPending(true);
    setDuplicate(null);
    try {
      const result = await submit(confirmDuplicate ? { ...input, confirmDuplicate } : input);
      if (result.status === "ok") {
        const { id, updatedAt } = result;
        toast({
          message: savedMessage,
          undo: undo && updatedAt ? () => undo({ id, updatedAt }).then(undone) : undefined,
          send: send?.(result, input) ?? undefined,
        });
        onSaved?.(result);
        return close();
      }
      if (result.status === "duplicate") return setDuplicate(result);
      setErrors(result.status === "invalid" ? result.errors : { form: result.message });
    } catch {
      setErrors({ form: NOT_SAVED });
    } finally {
      setPending(false);
    }
  }

  const values = fields && { ...fields, ...meta };
  const footerTotal = values && total?.(values);

  return (
    <form
      ref={ref}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation(); // a picker's add form is portaled, but React bubbles its submit
        const ask =
          ref.current && confirm?.({ ...Object.fromEntries(new FormData(ref.current)), ...meta });
        if (ask) setConfirming(ask);
        else save(false);
      }}
      onChange={read}
      noValidate
      className={cn("flex min-h-0 flex-1 flex-col", page && "gap-3")}
    >
      <FormInitial.Provider value={initial ?? NONE}>
        <FormErrors.Provider value={errors}>
          <FormChanged.Provider value={read}>
            <FormValues.Provider value={values}>
              <div className={cn("flex flex-col gap-3", !page && "overflow-y-auto p-4")}>
                {children}
                <NotesBox about={about} preview={preview && (values ? preview(values) : null)} />
              </div>
            </FormValues.Provider>
          </FormChanged.Provider>
        </FormErrors.Provider>
      </FormInitial.Provider>
      <div
        className={cn(
          "bg-background flex flex-col gap-2 border-t p-4",
          page
            ? "sticky bottom-16 -mx-4 lg:bottom-0"
            : "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        {errors.form && (
          <div role="alert" className="text-destructive flex flex-col gap-2 text-sm">
            <p>{errors.form}</p>
            {formErrorAction?.(errors.form, close)}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {footerTotal && <p className="mr-auto font-medium">{footerTotal}</p>}
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" className="min-h-11 min-w-24 px-4" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            {submitLabel}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        confirm={confirming}
        onBack={() => setConfirming(null)}
        onSave={() => {
          setConfirming(null);
          save(false);
        }}
      />
      <DuplicateDialog
        duplicate={duplicate}
        onCancel={() => setDuplicate(null)}
        onSave={() => save(true)}
      />
    </form>
  );
}

/** UIDD §5: a possible duplicate never blocks: View it · Save anyway · Cancel (SRS §2.3). */
function DuplicateDialog({
  duplicate,
  onCancel,
  onSave,
}: {
  duplicate: Duplicate | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Sheet open={duplicate !== null} onOpenChange={(o) => !o && onCancel()}>
      <SheetContent side="bottom" className="gap-0 rounded-t-xl lg:mx-auto lg:max-w-md">
        <SheetHeader>
          <SheetTitle>Possible duplicate</SheetTitle>
          <SheetDescription className="text-foreground text-base">
            {duplicate &&
              `A similar entry exists (by ${duplicate.by}, ${formatStamp(duplicate.at)}) — save anyway?`}
          </SheetDescription>
        </SheetHeader>
        <SheetFooter className="flex-row flex-wrap justify-end pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* The Journal (task 3.8) opens the entry from `?entry=`. */}
          <Button asChild variant="ghost" className="min-h-11 px-4">
            <SheetLink href={`/journal?entry=${duplicate?.id ?? ""}`}>View it</SheetLink>
          </Button>
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="min-h-11 px-4" onClick={onSave}>
            Save anyway
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** D-060, D-061 (UIDD §5): what Save will do, before it is saved: Save · Back (the form stays as typed). */
function ConfirmDialog({
  confirm,
  onBack,
  onSave,
}: {
  confirm: ConfirmSheet | null;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <Sheet open={confirm !== null} onOpenChange={(o) => !o && onBack()}>
      <SheetContent side="bottom" className="gap-0 rounded-t-xl lg:mx-auto lg:max-w-md">
        {/* pr-12: a long title wraps clear of the ✕ */}
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg">{confirm?.title}</SheetTitle>
          <SheetDescription className="text-foreground text-base">{confirm?.lead}</SheetDescription>
        </SheetHeader>
        <EffectRows rows={confirm?.rows ?? []} label="What this will do" className="mx-4" />
        {confirm?.notes.map((n) => (
          <p key={n} className="text-muted-foreground mx-4 mt-3 text-sm">
            {n}
          </p>
        ))}
        <SheetFooter className="flex-row flex-wrap justify-end pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={onBack}>
            Back
          </Button>
          <Button type="button" className="min-h-11 px-4" onClick={onSave}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
