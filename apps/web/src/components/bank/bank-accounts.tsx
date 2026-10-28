"use client";

import { useState } from "react";
import { CopyIcon, PencilIcon, PlusIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { Choice, TextField } from "@/components/forms/field";
import { FormModal } from "@/components/forms/form-modal";
import { type Option, PickerField } from "@/components/forms/picker";
import { useToast } from "@/components/forms/toast";
import { Button } from "@/components/ui/button";
import { bankAccountText, bankFields } from "@mbl/domain/business";
import type { OwnerKind } from "@mbl/domain/validation/business";
import { deleteBankAccount, saveBankAccount } from "@/server/actions/business";
import type { BankAccount, Owner } from "@/api/contract";
import { copyText, shareText } from "./copy-share";

// UIDD §4.14 (D-039): saved bank accounts as cards: each field with a copy button, Copy all,
// Share (the note stays out of both), Edit and Delete. Used by More → Saved details (any owner)
// and an owner's ⋯ → Bank accounts sheet (that owner only).

export type OwnerOptions = Record<Exclude<OwnerKind, "business">, Option[]>;

const OWNER_LABEL: [OwnerKind, string][] = [
  ["business", "The business"],
  ["person", "Person"],
  ["customer", "Customer"],
  ["supplier", "Supplier"],
];

export function useCopy() {
  const toast = useToast();
  return async (text: string) =>
    toast({ message: (await copyText(text)) ? "Copied" : "Couldn't copy — copy it by hand" });
}

export function BankAccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: BankAccount;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const copy = useCopy();
  const text = bankAccountText(account);
  return (
    <li className="flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex flex-col">
        {bankFields(account).map(([label, value]) => (
          <div key={label} className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-muted-foreground text-xs">{label}</span>
              <span className="font-medium break-all">{value}</span>
            </div>
            <Button
              variant="ghost"
              className="size-11 shrink-0"
              aria-label={`Copy ${label.toLowerCase()}`}
              onClick={() => copy(value)}
            >
              <CopyIcon />
            </Button>
          </div>
        ))}
      </div>
      {account.note && <p className="text-muted-foreground text-sm">{account.note}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11 px-3" onClick={() => copy(text)}>
          <CopyIcon /> Copy all
        </Button>
        <Button variant="outline" className="min-h-11 px-3" onClick={() => shareText(text)}>
          <Share2Icon /> Share
        </Button>
        <Button
          variant="ghost"
          className="ml-auto size-11"
          aria-label={`Edit ${account.bankName} ${account.accountNumber}`}
          onClick={onEdit}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          className="size-11"
          aria-label={`Delete ${account.bankName} ${account.accountNumber}`}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}

function BankAccountForm({
  account,
  owner,
  owners,
  open,
  onOpenChange,
}: {
  account: BankAccount | null;
  /** Fixed on an owner's page; picked on Saved details. */
  owner: Owner | null;
  owners?: OwnerOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [id] = useState(() => account?.id ?? crypto.randomUUID());
  const start = account?.owner ?? owner;
  const [kind, setKind] = useState<OwnerKind>(start?.kind ?? "business");
  const fixed: Record<string, string> = owner
    ? { ownerKind: owner.kind, ownerId: owner.id ?? "" }
    : {};
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={account ? "Edit bank account" : "Add bank account"}
      meta={{ id, ...(account ? { updatedAt: account.updatedAt } : {}), ...fixed }}
      submit={saveBankAccount}
    >
      {!owner && owners && (
        <>
          <Choice
            label="Owner"
            name="ownerKind"
            options={OWNER_LABEL}
            value={kind}
            onChange={setKind}
          />
          {kind !== "business" && (
            <PickerField
              key={kind}
              label={OWNER_LABEL.find(([k]) => k === kind)![1]}
              name="ownerId"
              placeholder="Pick the owner"
              options={owners[kind]}
              defaultValue={start?.kind === kind ? start.id : null}
            />
          )}
        </>
      )}
      <TextField label="Bank" name="bankName" placeholder="EBL" defaultValue={account?.bankName} />
      <TextField label="Branch" name="branch" defaultValue={account?.branch ?? ""} />
      <TextField label="Account name" name="accountName" defaultValue={account?.accountName} />
      <TextField
        label="Account number"
        name="accountNumber"
        inputMode="numeric"
        defaultValue={account?.accountNumber}
      />
      <TextField
        label="Routing number"
        name="routingNumber"
        inputMode="numeric"
        placeholder="9 digits"
        defaultValue={account?.routingNumber ?? ""}
      />
      <TextField label="Note" name="note" placeholder="Only for you" defaultValue={account?.note} />
    </FormModal>
  );
}

/** The cards, Add, and the add/edit/delete sheets. */
export function BankAccounts({
  accounts,
  owner = null,
  owners,
  empty = "No saved bank accounts yet.",
  children,
}: {
  accounts: BankAccount[];
  owner?: Owner | null;
  owners?: OwnerOptions;
  empty?: string;
  /** Rendered between Add and the cards (Saved details' grouped list). */
  children?: (card: (a: BankAccount) => React.ReactNode) => React.ReactNode;
}) {
  // `n` remounts the form for each opening (a fresh id for a new account).
  const [form, setForm] = useState<{ account: BankAccount | null; n: number } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<BankAccount | null>(null);
  const open = (account: BankAccount | null) => {
    setForm((f) => ({ account, n: (f?.n ?? 0) + 1 }));
    setFormOpen(true);
  };
  const card = (a: BankAccount) => (
    <BankAccountCard
      key={a.id}
      account={a}
      onEdit={() => open(a)}
      onDelete={() => setDeleting(a)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <Button className="min-h-11 self-start px-4" onClick={() => open(null)}>
        <PlusIcon /> Add bank account
      </Button>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : children ? (
        children(card)
      ) : (
        <ul className="flex flex-col gap-2">{accounts.map(card)}</ul>
      )}
      {form && (
        <BankAccountForm
          key={form.n}
          account={form.account}
          owner={owner}
          owners={owners}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}
      <FormModal
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete bank account?"
        meta={deleting ? { id: deleting.id, updatedAt: deleting.updatedAt } : {}}
        submit={deleteBankAccount}
        submitLabel="Delete"
        savedMessage="Deleted"
      >
        <p className="text-sm">
          {deleting && `${deleting.bankName} · ${deleting.accountNumber}`} is removed for good.
        </p>
      </FormModal>
    </div>
  );
}
