"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { copyText, shareText } from "@/components/bank/copy-share";
import { inputClass } from "@/components/forms/field";
import { modalSheet } from "@/components/forms/form-modal";
import { useToast } from "@/components/forms/toast";
import { SharePdfButton } from "@/components/report/share-pdf";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { withQuery } from "@/lib/href";
import { cn } from "@/lib/utils";
import { LONG_TEXT, compose, howToPayText, waLink } from "@/lib/whatsapp";
import { saveTemplate } from "@/server/actions/business";
import type { Draft } from "@/server/messages";
import { HowToPay, type PayAccount, firstPick } from "./how-to-pay";

// UIDD §4.15 (D-040): the send preview over an account page (`?send=`). The greeting comes from
// the saved template (editable; "Save greeting as default" saves it back with `{name}` in place of
// the name); "Add How to pay" (off) adds the picked business accounts; the message is editable.
// Send on WhatsApp opens wa.me with the number; with no number, Share opens the share sheet.
// D-043: a report's message (the Cash book, the Sales report) has no recipient, greeting or How to
// pay: the editable text, then Copy · Share.

/** The template to save the greeting into (null: nothing to save, e.g. Walk-in has no name). */
export type GreetingSave = {
  id: string;
  updatedAt: string;
  signOff: string;
  shop: string;
};

/** A report's message (D-043). */
export type ReportDraft = { type: "report"; body: string };

type Props = {
  draft: Draft | ReportDraft;
  greeting: string;
  signOff: string;
  save: GreetingSave | null;
  accounts: PayAccount[];
  closeHref: string;
};

export function SendSheet({ draft, greeting: initial, signOff, save, accounts, closeHref }: Props) {
  const router = useRouter();
  const toast = useToast();
  /** The message's draft; null for a report. */
  const d = draft.type === "report" ? null : draft;
  const [open, setOpen] = useState(true);
  const [greeting, setGreeting] = useState(initial);
  const [asDefault, setAsDefault] = useState(false);
  const [saved, setSaved] = useState(false);
  const [howToPay, setHowToPay] = useState(false);
  const [picked, setPicked] = useState(() => firstPick(accounts));
  const build = (on: boolean, ids: string[]) =>
    compose([
      draft.body,
      on && howToPayText(accounts.filter((a) => ids.includes(a.id)).map((a) => a.fields)),
      signOff,
    ]);
  const [message, setMessage] = useState(() => build(false, picked));
  const text = compose([greeting, message]);
  const long = text.length > LONG_TEXT;

  const close = () => {
    setOpen(false);
    router.push(closeHref, { scroll: false });
  };
  const payChange = (on: boolean, ids: string[]) => {
    setHowToPay(on);
    setPicked(ids);
    setMessage(build(on, ids));
  };
  /** Saves the greeting as the default once, when it is sent, copied or shared. */
  async function keepGreeting() {
    if (!d || !save || !asDefault || saved || greeting === initial || !d.name) return;
    setSaved(true);
    const result = await saveTemplate({
      id: save.id,
      updatedAt: save.updatedAt,
      type: d.type,
      greeting: greeting.replaceAll(d.name, "{name}").replaceAll(save.shop, "{shop}"),
      signOff: save.signOff,
    }).catch(() => null);
    if (result?.status !== "ok")
      toast({ message: result?.status === "conflict" ? result.message : "Greeting not saved" });
  }
  async function copy() {
    await keepGreeting();
    toast({ message: (await copyText(text)) ? "Copied" : "Couldn't copy — copy it by hand" });
  }

  const action = cn(buttonVariants({ variant: "default" }), "min-h-11 px-4");
  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} history={false}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(modalSheet, "overflow-y-auto lg:max-w-lg")}
      >
        <SheetHeader className="flex-row items-center justify-between border-b py-2">
          <SheetTitle className="text-lg">Send on WhatsApp</SheetTitle>
          <SheetDescription className="sr-only">
            Check and edit the message, then send, copy or share it
          </SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" className="-mr-2 size-11" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4 text-sm">
          {d && (
            <p>
              <span className="text-muted-foreground">To: </span>
              <span className="font-medium">{d.recipient}</span>
              {d.number ? ` · ${d.phone}` : ""}
            </p>
          )}
          {d && !d.number && (
            <p className="text-muted-foreground">
              No WhatsApp number — Share opens the share sheet.
            </p>
          )}

          {d && (
            <label className="flex flex-col gap-1 font-medium">
              Greeting
              <input
                className={cn(inputClass, "font-normal")}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
              />
            </label>
          )}
          {save && d?.name && (
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={asDefault}
                onChange={(e) => setAsDefault(e.target.checked)}
                className="accent-primary size-4"
              />
              Save greeting as default
            </label>
          )}

          {d && <HowToPay accounts={accounts} on={howToPay} picked={picked} onChange={payChange} />}

          <label className="flex flex-col gap-1 font-medium">
            Message
            <textarea
              className={cn(inputClass, "min-h-60 py-2 font-normal")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {long && (
            <p className="text-muted-foreground">
              This message is long: copy it, then paste it in the chat.
            </p>
          )}
          <p className="text-muted-foreground">
            Undo can&apos;t recall a message you&apos;ve sent.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" className="min-h-11 px-4" onClick={copy}>
            Copy
          </Button>
          {d?.pdf && (
            <SharePdfButton href={withQuery(d.pdf, { pay: howToPay ? picked.join(",") : null })} />
          )}
          {!d?.number ? (
            <Button
              className="min-h-11 px-4"
              onClick={async () => {
                await keepGreeting();
                await shareText(text);
              }}
            >
              Share
            </Button>
          ) : (
            <a
              href={long ? waLink(d.number) : waLink(d.number, text)}
              target="_blank"
              rel="noopener noreferrer"
              className={action}
              onClick={() => void keepGreeting()}
            >
              {long ? "Open chat" : "Send on WhatsApp"}
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
