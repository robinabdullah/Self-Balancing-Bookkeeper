"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { CopyIcon, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useCopy } from "@/components/bank/bank-accounts";
import { Choice, TextField } from "@/components/forms/field";
import { FormModal } from "@/components/forms/form-modal";
import { type Option, PickerField } from "@/components/forms/picker";
import { Button } from "@/components/ui/button";
import { SheetLink } from "@/components/ui/use-back-close";
import {
  CARD_TAGS,
  type CardDetails,
  type CardTag,
  FINGERPRINT_FAILED,
  NO_FINGERPRINT,
  REVEAL_SECONDS,
  TAG_LABEL,
  cardDetailFields,
  cardDetailsText,
  maskedLine,
  tagOf,
} from "@/lib/card-secrets";
import { removeCardDetails, saveCardDetails } from "@/server/actions/card-secrets";
import { revealOptions } from "@/server/actions/passkeys";
import type { CardSecret } from "@/server/card-secrets";
import { BankBadge } from "./bank-badge";
import { CardNumberField, ExpiryField } from "./card-detail-fields";

// D-046 (UIDD §4.14): saved card details, masked to the last 4 digits (D-051). Reveal needs the
// fingerprint, never the password (D-052: a saved password could be autofilled); without one it
// points to Settings. Edit and Remove appear only while revealed. Used by Saved details → Cards
// and the card's ⋯ → Card details.
// D-054: each card lists its saved numbers (Primary first, then Supplementary). One fingerprint
// opens a window of `REVEAL_SECONDS`, fixed from the scan, in which any number reveals at once;
// one is shown at a time. Hide, the app going to the background or the window losing focus ends
// it, and the next Reveal asks for the fingerprint again.

type Shown = { secretId: string; details: CardDetails };
/** Why a reveal didn't happen: no fingerprint here (status), or it failed (alert). */
type Notice = { secretId: string; message: string; failed: boolean };

const tagLabel = (item: CardSecret) => TAG_LABEL[tagOf(item.supplementary)];
/** D-054: the window a fingerprint opens ends this long after the scan, whatever is revealed. */
const windowEnd = () => Date.now() + REVEAL_SECONDS * 1000;
const isOpen = (until: number) => until > Date.now();

/** The saved numbers grouped by card, in the order loaded (a card's primary first). */
function byCard(items: CardSecret[]) {
  const groups = new Map<string, CardSecret[]>();
  for (const item of items) groups.set(item.cardId, [...(groups.get(item.cardId) ?? []), item]);
  return [...groups.values()];
}

async function unlock(cardId: string, body: object) {
  try {
    const res = await fetch(`/cards/${cardId}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json();
    return res.ok ? { details: json as CardDetails } : { error: String(json.error) };
  } catch {
    return { error: "Couldn't reveal — try again" };
  }
}

export function CardSecrets({
  items,
  addable,
  cardId,
  hasPasskey,
  withPrimary = items.filter((s) => !s.supplementary).map((s) => s.cardId),
  empty = "No saved card details yet.",
}: {
  items: CardSecret[];
  /** Saved details: the active cards, to pick from. */
  addable?: Option[];
  /** A card's page: that card only (Add needs no picker). */
  cardId?: string;
  hasPasskey: boolean;
  /** The cards that have a primary number (Add then starts on Supplementary). */
  withPrimary?: string[];
  empty?: string;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [until, setUntil] = useState(0); // D-054: when the fingerprint's window ends (0: closed)
  const [left, setLeft] = useState(0); // seconds until it masks again
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(false);
  // `n` remounts the form for each opening (a fresh id for new details).
  const [form, setForm] = useState<{ item: CardSecret | null; n: number } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<CardSecret | null>(null);

  const close = useCallback(() => {
    setShown(null);
    setUntil(0);
  }, []);

  // Mask again and close the window when the time is up (by the clock, so a slowed timer can't
  // stretch it), when the app goes to the background, or when the window loses focus (the app
  // switcher's thumbnail; a web page can't block screenshots).
  useEffect(() => {
    if (!until) return;
    const tick = setInterval(() => {
      const seconds = Math.ceil((until - Date.now()) / 1000);
      if (seconds <= 0) close();
      else setLeft(seconds);
    }, 1000);
    const hide = () => document.hidden && close();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", close);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", close);
    };
  }, [until, close]);

  async function reveal(item: CardSecret) {
    setNotice(null);
    const fail = (message: string, failed = true) =>
      setNotice({ secretId: item.id, message, failed });
    setPending(true);
    try {
      // Within the window: no new fingerprint, and the countdown keeps running.
      if (isOpen(until)) {
        const r = await unlock(item.cardId, { secretId: item.id, window: true });
        if (r.details) return setShown({ secretId: item.id, details: r.details });
      }
      close();
      if (!hasPasskey || !browserSupportsWebAuthn()) return fail(NO_FINGERPRINT, false);
      const options = await revealOptions();
      if (!options) return fail(NO_FINGERPRINT, false);
      const passkey = await startAuthentication({ optionsJSON: options });
      const r = await unlock(item.cardId, { secretId: item.id, passkey });
      if (!r.details) return fail(r.error);
      setLeft(REVEAL_SECONDS);
      setUntil(windowEnd());
      setShown({ secretId: item.id, details: r.details });
    } catch {
      fail(FINGERPRINT_FAILED); // cancelled, or no passkey on this device
    } finally {
      setPending(false);
    }
  }

  const open = (item: CardSecret | null) => {
    setForm((f) => ({ item, n: (f?.n ?? 0) + 1 }));
    setFormOpen(true);
  };
  const canAdd = cardId ? true : (addable?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3">
      {canAdd && (
        <Button className="min-h-11 self-start px-4" onClick={() => open(null)}>
          <PlusIcon /> Add card details
        </Button>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {byCard(items).map((numbers) => (
            <li
              key={numbers[0].cardId}
              className="flex flex-col gap-2 rounded-lg border p-3"
              aria-label={numbers[0].display}
            >
              <div className="flex items-center gap-2">
                <BankBadge name={numbers[0].card} />
                <span className="min-w-0 flex-1 font-medium break-words">{numbers[0].display}</span>
              </div>
              <ul className="flex flex-col divide-y">
                {numbers.map((item) => (
                  <CardSecretItem
                    key={item.id}
                    item={item}
                    shown={shown?.secretId === item.id ? shown : null}
                    secondsLeft={left}
                    notice={notice?.secretId === item.id ? notice : null}
                    inSheet={!!cardId}
                    pending={pending}
                    onReveal={() => reveal(item)}
                    onHide={close}
                    onEdit={() => open(item)}
                    onRemove={() => setRemoving(item)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {form && (
        <CardDetailsForm
          key={form.n}
          item={form.item}
          details={form.item && shown?.secretId === form.item.id ? shown.details : null}
          cardId={cardId}
          withPrimary={withPrimary}
          addable={addable}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={() => setShown(null)}
        />
      )}
      <FormModal
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove card details?"
        meta={removing ? { id: removing.id, updatedAt: removing.updatedAt } : {}}
        submit={removeCardDetails}
        submitLabel="Remove"
        savedMessage="Removed"
        onSaved={() => setShown(null)}
      >
        <p className="text-sm">
          {removing && `${removing.display} · ${tagLabel(removing)} · ${removing.last4}`}: the saved
          details are removed for good. The card itself stays.
        </p>
      </FormModal>
    </div>
  );
}

function CardSecretItem({
  item,
  shown,
  secondsLeft,
  notice,
  inSheet,
  pending,
  onReveal,
  onHide,
  onEdit,
  onRemove,
}: {
  item: CardSecret;
  shown: Shown | null;
  secondsLeft: number;
  notice: Notice | null;
  /** In the card's sheet, the Settings link replaces the sheet in history (D-035). */
  inSheet: boolean;
  pending: boolean;
  onReveal: () => void;
  onHide: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const copy = useCopy();
  const SettingsLink = inSheet ? SheetLink : Link;
  const tag = tagLabel(item);
  return (
    <li
      className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0"
      aria-label={`${tag} ${item.last4}`}
    >
      {shown ? (
        <>
          <span className="text-muted-foreground text-xs">{tag}</span>
          <div className="flex flex-col">
            {cardDetailFields(shown.details).map(([label, value, copied]) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-muted-foreground text-xs">{label}</span>
                  <span className="font-medium break-all tabular-nums">{value}</span>
                </div>
                <Button
                  variant="ghost"
                  className="size-11 shrink-0"
                  aria-label={`Copy ${label.toLowerCase()}`}
                  onClick={() => copy(copied)}
                >
                  <CopyIcon />
                </Button>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">Hides in {secondsLeft} s</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-11 px-3"
              onClick={() => copy(cardDetailsText(shown.details))}
            >
              <CopyIcon /> Copy all
            </Button>
            <Button variant="outline" className="min-h-11 px-3" onClick={onHide}>
              <EyeOffIcon /> Hide
            </Button>
            <Button
              variant="ghost"
              className="ml-auto size-11"
              aria-label={`Edit ${item.display} details`}
              onClick={onEdit}
            >
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              className="size-11"
              aria-label={`Remove ${item.display} details`}
              onClick={onRemove}
            >
              <Trash2Icon />
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-muted-foreground text-xs">{tag}</span>
              <span className="font-medium tabular-nums">{maskedLine(item.last4)}</span>
            </div>
            <Button
              variant="outline"
              className="min-h-11 shrink-0 px-3"
              disabled={pending}
              onClick={onReveal}
            >
              <EyeIcon /> Reveal
            </Button>
          </div>
          {notice && (
            <div
              role={notice.failed ? "alert" : "status"}
              className={notice.failed ? "text-destructive text-sm" : "text-sm"}
            >
              <p>{notice.message}</p>
              <SettingsLink
                href="/settings"
                className="text-primary inline-flex min-h-11 items-center underline underline-offset-4"
              >
                Settings → Fingerprint unlock
              </SettingsLink>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function CardDetailsForm({
  item,
  details,
  cardId,
  withPrimary,
  addable,
  open,
  onOpenChange,
  onSaved,
}: {
  item: CardSecret | null;
  /** Edit: the revealed values the form starts from. */
  details: CardDetails | null;
  cardId?: string;
  withPrimary: string[];
  addable?: Option[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [id] = useState(() => item?.id ?? crypto.randomUUID());
  const fixed = item?.cardId ?? cardId;
  // D-054: a card's first number is its Primary; once it has one, a new number is Supplementary.
  const tagFor = (card?: string): CardTag =>
    card && withPrimary.includes(card) ? "supplementary" : "primary";
  const [tag, setTag] = useState<CardTag>(item ? tagOf(item.supplementary) : tagFor(fixed));
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit card details" : "Add card details"}
      about="card_details"
      meta={{
        id,
        ...(item ? { updatedAt: item.updatedAt } : {}),
        ...(fixed ? { cardId: fixed } : {}),
      }}
      submit={saveCardDetails}
      onSaved={onSaved}
    >
      {!fixed && addable && (
        <PickerField
          label="Card"
          name="cardId"
          placeholder="Pick the card"
          options={addable}
          onChange={(card) => setTag(tagFor(card))}
        />
      )}
      <Choice
        label="Primary or supplementary"
        name="tag"
        options={CARD_TAGS.map((t) => [t, TAG_LABEL[t]])}
        value={tag}
        onChange={setTag}
      />
      <TextField
        label="Cardholder name"
        name="holder"
        autoComplete="off"
        defaultValue={details?.holder ?? ""}
      />
      <CardNumberField initial={details?.number ?? ""} />
      <ExpiryField initial={details?.expiry ?? ""} />
      <TextField
        label="CVV"
        name="cvv"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={details?.cvv ?? ""}
      />
    </FormModal>
  );
}
