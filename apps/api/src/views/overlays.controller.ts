import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import type { StatementKind } from "@mbl/domain/accounts";
import { fillTemplate, firstPhone, template } from "@mbl/domain/business";
import { parseRange } from "@mbl/domain/journal-filter";
import { rowId } from "@mbl/domain/validation/fields";
import { AccountReportsService } from "../account-reports/account-reports.service";
import { context } from "../auth/context";
import { BusinessService } from "../business/business.service";
import { CardSecretsDataService } from "../card-secrets/card-secrets-data.service";
import { type DraftSource, MessagesService } from "../messages/messages.service";
import { Passkeys } from "../passkeys/passkeys";

// N-4.5 (design rule 6): what the overlays an account page opens from its URL read, one call
// each (the render's memo shares the books and Setup with the page). Ref:
// src/components/{bank/bank-overlay,accounts/account-overlays,send/send-overlay,
// report/by-model,cards/card-secrets-overlay}.tsx.

type Q = Record<string, string | undefined>;

const KINDS: StatementKind[] = ["customer", "supplier", "card", "person"];
const isKind = (k: string | undefined): k is StatementKind => KINDS.includes(k as StatementKind);
const idOf = (v: string | undefined) => (v && rowId.safeParse(v).success ? v : null);

/** The send preview's source from its query (as `withQuery` wrote it), or null. */
function draftSource(q: Q): DraftSource | null {
  const range = parseRange(q);
  if (q.kind === "entry") {
    const id = idOf(q.id);
    return id ? { kind: "entry", id } : null;
  }
  if (q.kind === "reminder") {
    const customerId = idOf(q.customerId);
    return customerId ? { kind: "reminder", customerId } : null;
  }
  if (q.kind === "statement") {
    const id = idOf(q.id);
    return id && range && isKind(q.account)
      ? { kind: "statement", account: q.account, id, ...range }
      : null;
  }
  if (q.kind === "investor") {
    const personId = idOf(q.personId);
    return personId && range ? { kind: "investor", personId, ...range } : null;
  }
  return null;
}

@Controller("views")
export class OverlayViewsController {
  constructor(
    private readonly business: BusinessService,
    private readonly messages: MessagesService,
    private readonly reports: AccountReportsService,
    private readonly secrets: CardSecretsDataService,
    private readonly keys: Passkeys,
  ) {}

  /** D-039: an owner's saved bank accounts (`?bank=1`). */
  @Get("bank-accounts")
  async bankAccounts(@Query() q: Q) {
    const accounts = await this.business.loadBankAccounts();
    return accounts.filter((a) => a.owner.kind === q.kind && a.owner.id === (q.id ?? null));
  }

  /** D-041: the business's own accounts, for the Report sheet's How to pay. */
  @Get("pay-accounts")
  payAccounts() {
    return this.business.payAccounts();
  }

  /**
   * D-040: the send preview (`?send=`): the draft, the saved template's greeting and sign-off
   * (D-039) filled in, and the business's accounts for How to pay. Null: nothing to send.
   */
  @Get("send")
  async send(@Query() q: Q) {
    const source = draftSource(q);
    if (!source) return null;
    const [draft, business, accounts] = await Promise.all([
      this.messages.loadDraft(source),
      this.business.getBusiness(),
      this.business.payAccounts(),
    ]);
    if (!draft) return null;
    const t = template(business?.templates, draft.type);
    const values = { name: draft.name, shop: business?.name, phone: firstPhone(business?.phones) };
    return {
      draft,
      greeting: fillTemplate(t.greeting, values),
      signOff: fillTemplate(t.signOff, values),
      save: business && {
        id: business.id,
        updatedAt: business.updatedAt,
        signOff: t.signOff,
        shop: business.name,
      },
      accounts,
    };
  }

  /** D-045: a statement's By model tables (or a card's period extras) for `?from=&to=`. */
  @Get("statement-extras/:kind/:id")
  statementExtras(@Param("kind") kind: string, @Param("id") id: string, @Query() q: Q) {
    const range = parseRange(q);
    if (!isKind(kind) || !idOf(id) || !range) throw new NotFoundException();
    return this.reports.loadStatementExtras(kind, id, range.from, range.to);
  }

  /** D-046: a card's saved numbers, masked, and whether you have a fingerprint to reveal them. */
  @Get("card-secrets/:cardId")
  async cardSecrets(@Param("cardId") cardId: string) {
    const { userId } = context();
    const [items, keys] = await Promise.all([
      this.secrets.loadCardSecrets(),
      userId ? this.keys.loadPasskeys(userId) : [],
    ]);
    return { items: items.filter((s) => s.cardId === cardId), hasPasskey: keys.length > 0 };
  }
}

export type BankAccountsView = Awaited<ReturnType<OverlayViewsController["bankAccounts"]>>;
export type PayAccountsView = Awaited<ReturnType<OverlayViewsController["payAccounts"]>>;
export type SendView = Awaited<ReturnType<OverlayViewsController["send"]>>;
export type StatementExtrasView = Awaited<ReturnType<OverlayViewsController["statementExtras"]>>;
export type CardSecretsView = Awaited<ReturnType<OverlayViewsController["cardSecrets"]>>;
