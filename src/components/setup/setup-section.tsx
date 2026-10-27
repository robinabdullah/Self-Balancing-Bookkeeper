"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVerticalIcon, PlusIcon } from "lucide-react";
import { inputClass } from "@/components/forms/field";
import { FormModal } from "@/components/forms/form-modal";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { leaveSheet } from "@/components/ui/use-back-close";
import { format, parse } from "@/lib/money";
import { type SetupKind, USED } from "@/lib/setup";
import { removeRow, setActive } from "@/server/actions/setup";
import type { SetupData } from "@/server/setup";
import { SetupForm, type SetupRow } from "./setup-forms";

// UIDD §4.11: one Setup list. Add/edit open the modal form; a used row is deactivated, not
// deleted; Walk-in is read-only with a "Built-in" badge (D-023). Inactive rows stay listed here
// and are hidden in pickers.

type Item = {
  row: SetupRow;
  title: string;
  detail: string;
  badges: string[];
  builtIn: boolean;
  search: string;
};

const money = (stored: string | null) => (stored === null ? null : format(parse(stored) ?? 0));
const join = (...parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(" · ");
const alsoDeletes = (n: number) => `Also deletes ${n} saved bank account${n === 1 ? "" : "s"}`;
/** D-054: a card can hold several saved numbers (its primary and supplementary cards). */
const alsoDeletesCard = (n: number) =>
  n === 1 ? "Also deletes the saved card details" : `Also deletes ${n} saved card numbers`;
type Contacts = { phone: string | null; whatsapp: string | null; email: string | null };
/** The WhatsApp number only when it differs from the phone. */
const contacts = (r: Contacts) => [
  r.phone,
  r.whatsapp && r.whatsapp !== r.phone && `WhatsApp ${r.whatsapp}`,
  r.email,
];

const lists: Record<SetupKind, { add: string; empty: string; items: (d: SetupData) => Item[] }> = {
  person: {
    add: "Add person",
    empty: "No people yet. Add the partners first.",
    items: (d) =>
      d.people.map((p) => ({
        row: p,
        title: p.name,
        detail: join(
          p.kind === "partner" ? `Partner ${Number(p.profitSharePct ?? 0)}%` : "Investor",
          p.note,
          ...contacts(p),
        ),
        badges: [],
        builtIn: false,
        search: p.name,
      })),
  },
  card: {
    add: "Add card",
    empty: "No cards yet.",
    items: (d) =>
      d.cards.map((c) => {
        const limit = money(c.creditLimit);
        return {
          row: c,
          title: c.display,
          detail: join(`Statement ${c.statementDay}`, `Due ${c.dueDay}`, limit && `Limit ${limit}`),
          badges: [],
          builtIn: false,
          search: c.display,
        };
      }),
  },
  customer: {
    add: "Add customer",
    empty: "No customers yet.",
    items: (d) =>
      d.customers.map((c) => {
        const target = money(c.targetBalance);
        return {
          row: c,
          title: c.display,
          detail: join(...contacts(c), c.address, target && `Target ${target}`),
          badges: [c.isSystem && "Built-in", c.shopNameMissing && "Shop name missing"].filter(
            (b): b is string => !!b,
          ),
          builtIn: c.isSystem,
          search: `${c.shopName ?? ""} ${c.proprietorName}`.toLowerCase(),
        };
      }),
  },
  supplier: {
    add: "Add supplier",
    empty: "No suppliers yet.",
    items: (d) =>
      d.suppliers.map((s) => ({
        row: s,
        title: s.name,
        detail: join(...contacts(s)),
        badges: [],
        builtIn: false,
        search: s.name,
      })),
  },
  model: {
    add: "Add model",
    empty: "No phone models yet.",
    items: (d) =>
      d.models.map((m) => ({
        row: m,
        title: m.name,
        detail: "",
        badges: [],
        builtIn: false,
        search: m.name,
      })),
  },
};

export function SetupSection({
  kind,
  data,
  banks = {},
  cardDetails = [],
  edit,
  from,
}: {
  kind: SetupKind;
  data: SetupData;
  /** Saved bank accounts per owner id: they go with the owner (D-039). */
  banks?: Record<string, number>;
  /** The card of each saved number: they go with the card (D-046, D-054). */
  cardDetails?: string[];
  /** D-032: a detail page's Edit opens this row's form at once … */
  edit?: string;
  /** … and closing it goes back to that page. */
  from?: string;
}) {
  const list = lists[kind];
  const router = useRouter();
  const [query, setQuery] = useState("");
  const editing = list.items(data).find((i) => i.row.id === edit && !i.builtIn)?.row ?? null;
  // The form stays mounted while it slides out; `n` remounts it (a fresh id) for each opening.
  const [form, setForm] = useState<{ row: SetupRow | null; n: number }>({ row: editing, n: 0 });
  const [formOpen, setFormOpen] = useState(!!editing);
  const [returning, setReturning] = useState(!!editing && !!from);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (row: SetupRow | null) => {
    setReturning(false);
    setForm((f) => ({ row, n: f.n + 1 }));
    setFormOpen(true);
  };
  const toggle = async (row: SetupRow, active: boolean) => {
    const result = await setActive(kind, { id: row.id, updatedAt: row.updatedAt, active }).catch(
      () => null,
    );
    if (!result) return setError("Not saved — try again");
    if (result.status === "invalid") return setError(Object.values(result.errors)[0]);
    setError(result.status === "conflict" ? result.message : null);
  };

  const q = query.trim().toLowerCase();
  const items = list.items(data).filter((i) => !q || i.search.toLowerCase().includes(q));
  const empty = items.length === 0 && !q; // the empty state holds the Add button (UIDD §5)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {kind === "customer" ? (
          <input
            type="search"
            aria-label="Search customers"
            placeholder="Search shop or proprietor"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass}
          />
        ) : (
          <span />
        )}
        {!empty && (
          <Button className="min-h-11 shrink-0 px-4" onClick={() => open(null)}>
            <PlusIcon />
            {list.add}
          </Button>
        )}
      </div>

      {kind === "person" && data.partnerWarning && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
        >
          {data.partnerWarning}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState hint={q ? "No customers match." : list.empty}>
          {!q && (
            <Button className="min-h-11 px-4" onClick={() => open(null)}>
              <PlusIcon />
              {list.add}
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <Row
              key={item.row.id}
              item={item}
              onEdit={() => open(item.row)}
              onToggle={() => toggle(item.row, !item.row.active)}
              onDelete={() => setDeleting(item)}
            />
          ))}
        </ul>
      )}

      <SetupForm
        key={form.n}
        kind={kind}
        row={form.row}
        data={data}
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o && returning && from) {
            setReturning(false);
            leaveSheet(); // the form's history entry becomes `from` (D-035)
            router.replace(from);
          }
        }}
      />
      <FormModal
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.title ?? ""}?`}
        meta={deleting ? { id: deleting.row.id, updatedAt: deleting.row.updatedAt } : {}}
        submit={(input) => removeRow(kind, input)}
        submitLabel="Delete"
        savedMessage="Deleted"
        formErrorAction={(message, close) =>
          message === USED &&
          deleting && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 self-start"
              onClick={async () => {
                await toggle(deleting.row, false);
                close();
              }}
            >
              Deactivate instead
            </Button>
          )
        }
      >
        <p className="text-sm">It is removed for good. This can&apos;t be undone.</p>
        {deleting && banks[deleting.row.id] > 0 && (
          <p className="text-sm font-medium">{alsoDeletes(banks[deleting.row.id])}</p>
        )}
        {deleting && cardDetails.includes(deleting.row.id) && (
          <p className="text-sm font-medium">
            {alsoDeletesCard(cardDetails.filter((id) => id === deleting.row.id).length)}
          </p>
        )}
      </FormModal>
    </section>
  );
}

function Row({
  item,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: Item;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const badges = item.row.active ? item.badges : [...item.badges, "Inactive"];
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center text-left disabled:cursor-default"
        onClick={onEdit}
        disabled={item.builtIn}
      >
        <span className={item.row.active ? "font-medium" : "text-muted-foreground font-medium"}>
          {item.title}
        </span>
        {item.detail && (
          <span className="text-muted-foreground max-w-full truncate text-sm">{item.detail}</span>
        )}
        {badges.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b} className="bg-muted rounded-full border px-2 py-0.5 text-xs">
                {b}
              </span>
            ))}
          </span>
        )}
      </button>
      {!item.builtIn && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="size-11" aria-label={`Actions for ${item.title}`}>
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="min-h-11" onSelect={onEdit}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onSelect={onToggle}>
              {item.row.active ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" variant="destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
