"use client";

import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { TextAreaField, TextField } from "@/components/forms/field";
import { FormModal } from "@/components/forms/form-modal";
import { BusinessLogo } from "@/components/shell/business-logo";
import { NavSheet } from "@/components/shell/nav-sheets";
import { MESSAGE_LABEL, MESSAGE_TYPES, type MessageType, template } from "@mbl/domain/business";
import { TERMS_MAX } from "@mbl/domain/validation/business";
import { saveBusinessDetails, savePdfTerms, saveTemplate } from "@/server/actions/business";
import type { Business } from "@/server/business";
import { LogoForm } from "./logo-form";

// UIDD §4.13 (D-039, D-049): Settings → Business in four short parts: Details · Logo · Messages ·
// PDF terms. Each opens a small sheet with its own Save. They share the row's `updatedAt` (one
// row, D-010).

export const rowClass =
  "hover:bg-muted flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left";

function Row({ title, detail, logo }: { title: string; detail: string; logo?: string | null }) {
  return (
    <>
      {logo && <BusinessLogo src={logo} size={28} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground truncate text-sm">{detail}</span>
      </span>
      <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden />
    </>
  );
}

/** D-049: each box with its example as the hint. */
const TERMS = [
  [
    "Invoice terms",
    "invoiceTerms",
    "7-day replacement for a manufacturing defect, box and accessories intact",
  ],
  ["Receipt terms", "receiptTerms", "Cheque payments are subject to clearance"],
  ["Statement terms", "statementTerms", "Please report any difference within 7 days"],
  ["Footer line", "footer", "Thank you for your business"],
] as const;

export function BusinessSettings({ business, logo }: { business: Business; logo: string | null }) {
  const [updatedAt, setUpdatedAt] = useState(business.updatedAt);
  const [open, setOpen] = useState<"details" | "logo" | "terms" | MessageType | null>(null);
  const meta = { id: business.id, updatedAt };
  const shell = (which: NonNullable<typeof open>) => ({
    open: open === which,
    onOpenChange: (o: boolean) => setOpen(o ? which : null),
    meta,
    onSaved: (r: { updatedAt: string | null }) => r.updatedAt && setUpdatedAt(r.updatedAt),
  });
  const b = business;

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Business</legend>
      <button type="button" className={rowClass} onClick={() => setOpen("details")}>
        <Row title="Details" detail={[b.name, b.phones].filter(Boolean).join(" · ")} />
      </button>
      <button type="button" className={rowClass} onClick={() => setOpen("logo")}>
        <Row
          title="Logo"
          detail={logo ? "Shown in the top bar and on shared files" : "No logo"}
          logo={logo}
        />
      </button>
      <NavSheet
        trigger={<Row title="Messages" detail="Greeting and sign-off for each message" />}
        triggerClass={rowClass}
        title="Messages"
        description="Greeting and sign-off for each message type"
      >
        <p className="text-muted-foreground px-3 pb-1 text-sm">
          {"{name}"} = the customer or person, {"{shop}"} = the business name, {"{phone}"} = its
          first phone.
        </p>
        {MESSAGE_TYPES.map((t) => (
          <button key={t} type="button" className={rowClass} onClick={() => setOpen(t)}>
            <Row
              title={MESSAGE_LABEL[t]}
              detail={template(b.templates, t).greeting || "No greeting"}
            />
          </button>
        ))}
      </NavSheet>
      <button type="button" className={rowClass} onClick={() => setOpen("terms")}>
        <Row title="PDF terms" detail="Printed at the end of invoices, receipts and statements" />
      </button>

      <FormModal {...shell("details")} title="Business details" submit={saveBusinessDetails}>
        <TextField label="Name" name="name" defaultValue={b.name} />
        <TextField label="Short name" name="shortName" defaultValue={b.shortName ?? ""} />
        <TextField label="Address" name="address" defaultValue={b.address ?? ""} />
        <TextField label="Phones" name="phones" type="tel" defaultValue={b.phones ?? ""} />
        <TextField label="WhatsApp" name="whatsapp" type="tel" defaultValue={b.whatsapp ?? ""} />
        <TextField label="Email" name="email" type="email" defaultValue={b.email ?? ""} />
        <TextField label="Trade licence" name="tradeLicence" defaultValue={b.tradeLicence ?? ""} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="TIN" name="tin" defaultValue={b.tin ?? ""} />
          <TextField label="BIN" name="bin" defaultValue={b.bin ?? ""} />
        </div>
      </FormModal>

      <LogoForm {...shell("logo")} current={logo} />

      <FormModal {...shell("terms")} title="PDF terms" submit={savePdfTerms}>
        <p className="text-muted-foreground text-sm">
          Each line becomes a numbered term under &ldquo;Terms &amp; conditions&rdquo;. The footer
          line prints centered below them. Blank prints nothing.
        </p>
        {TERMS.map(([label, name, hint]) => (
          <TextAreaField
            key={name}
            label={label}
            name={name}
            defaultValue={b[name] ?? ""}
            placeholder={hint}
            maxLength={TERMS_MAX}
          />
        ))}
      </FormModal>

      {MESSAGE_TYPES.map((t) => {
        const current = template(b.templates, t);
        return (
          <FormModal
            key={t}
            {...shell(t)}
            title={`${MESSAGE_LABEL[t]} message`}
            meta={{ ...meta, type: t }}
            submit={saveTemplate}
          >
            <TextField label="Greeting" name="greeting" defaultValue={current.greeting} />
            <TextField label="Sign-off" name="signOff" defaultValue={current.signOff} />
          </FormModal>
        );
      })}
    </fieldset>
  );
}
