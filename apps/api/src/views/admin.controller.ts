import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { logoSrc } from "@mbl/domain/business";
import { profitsFor } from "@mbl/domain/charts/profit";
import { dhakaToday, formatDate, monthOf } from "@mbl/domain/dates";
import { nextToClose } from "@mbl/domain/engine/months";
import { breakdownLines, closeScreen, monthList } from "@mbl/domain/months-view";
import { partnerWarning } from "@mbl/domain/setup";
import { context } from "../auth/context";
import { AuthService } from "../auth/auth.service";
import { BooksService } from "../books/books.service";
import { BusinessService } from "../business/business.service";
import { CardSecretsDataService } from "../card-secrets/card-secrets-data.service";
import { ExportService } from "../export/export.service";
import { MonthsDataService } from "../months/months-data.service";
import { Passkeys } from "../passkeys/passkeys";
import { SetupDataService } from "../setup/setup-data.service";

// N-4.6 (design rule 6): the admin pages' reads: Months (and a month), Setup, Saved details,
// Settings and Export. Every Date is already text here: Settings' device rows and profile are
// built in the view. A bad or unknown month is a 404 (the page's own notFound cases). Ref: the
// `months`, `months/[month]`, `setup`, `saved`, `settings` and `export` pages.

@Controller("views")
export class AdminViewsController {
  constructor(
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly months: MonthsDataService,
    private readonly business: BusinessService,
    private readonly secrets: CardSecretsDataService,
    private readonly passkeys: Passkeys,
    private readonly auth: AuthService,
    private readonly exports: ExportService,
  ) {}

  /** UIDD §4.9 (task 5.1, CR-024): every month with its profit and status. */
  @Get("months")
  async monthsList() {
    const [{ data, books, asOf }, closes] = await Promise.all([
      this.books.loadBooks(),
      this.months.loadCloses(),
    ]);
    const first = data.entries[0]?.date ?? null;
    const next = nextToClose(data.closed, first, asOf);
    return { rows: monthList(books.months, closes, next, monthOf(asOf)), first };
  }

  /**
   * UIDD §4.9 (tasks 5.1, 5.2, 5.4): a closed month's snapshot, a later open month's breakdown so
   * far, or the close screen for the next month to close; any other month is not found.
   */
  @Get("months/:month")
  async month(@Param("month") month: string) {
    const [{ data, books, asOf }, setup] = await Promise.all([
      this.books.loadBooks(),
      this.setup.loadSetup(),
    ]);
    const nameOf = new Map(setup.people.map((p) => [p.id, p.name]));
    // The month's profit: a closed month's stored snapshot, else as known today (the Months page).
    const profitOf = (snapshots = {}) => profitsFor([month], snapshots, books.posted, asOf)[month];

    if (data.closed.some((c) => monthOf(c) === month)) {
      const close = await this.months.loadClose(month);
      if (!close) throw new NotFoundException();
      const latest = data.closed.map(monthOf).sort().at(-1) === month;
      const paid = latest ? await this.months.profitSinceClose(month) : [];
      const profit = profitOf({ [month]: close.snapshot });
      return {
        kind: "closed" as const,
        closeDate: close.closeDate,
        by: close.by,
        lines: breakdownLines(profit),
        total: profit.total,
        allocations: data.allocations.filter((a) => monthOf(a.month) === month),
        names: Object.fromEntries(nameOf),
        latest,
        close: { id: close.id, updatedAt: close.updatedAt },
        paid,
      };
    }

    const next = nextToClose(data.closed, data.entries[0]?.date ?? null, asOf);
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month > next && month <= monthOf(asOf)) {
      const profit = profitOf();
      return {
        kind: "open" as const,
        next,
        lines: breakdownLines(profit),
        total: profit.total,
      };
    }

    if (month !== next) throw new NotFoundException();
    const screen = closeScreen(data, books, setup.people, month, asOf);
    const customerOf = new Map(setup.customers.map((c) => [c.id, c.display]));
    return {
      kind: "close" as const,
      lines: screen.lines,
      total: screen.profit.total,
      warning: partnerWarning(setup.people),
      investors: screen.investors,
      partners: data.partners.map((p) => ({ ...p, name: nameOf.get(p.id) ?? "Partner" })),
      reminders: screen.reminders.map((id) => ({ id, name: customerOf.get(id) ?? "Customer" })),
    };
  }

  /** UIDD §4.11: the Setup lists, the bank-account counts and the cards with saved details. */
  @Get("setup")
  async setupLists() {
    const [data, banks, secrets] = await Promise.all([
      this.setup.loadSetup(),
      this.business.bankCounts(),
      this.secrets.loadCardSecrets(),
    ]);
    return { data, banks, cardDetails: secrets.map((s) => s.cardId) };
  }

  /** UIDD §4.14: More → Saved details, the bank-accounts tab or the cards tab (D-046). */
  @Get("saved")
  async saved(@Query("tab") tab?: string) {
    if (tab === "cards") {
      const { userId } = context();
      const [items, setup, keys] = await Promise.all([
        this.secrets.loadCardSecrets(),
        this.setup.loadSetup(),
        userId ? this.passkeys.loadPasskeys(userId) : [],
      ]);
      // D-054: any active card, also one that has numbers (a supplementary card on its bill).
      const addable = setup.cards
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, label: c.display }));
      return { tab: "cards" as const, items, addable, hasPasskey: keys.length > 0 };
    }
    const [accounts, setup] = await Promise.all([
      this.business.loadBankAccounts(),
      this.setup.loadSetup(),
    ]);
    const has = new Set(accounts.map((a) => a.owner.id));
    const pickable = (r: { id: string; active: boolean }) => r.active || has.has(r.id);
    const owners = {
      person: setup.people.filter(pickable).map((p) => ({ id: p.id, label: p.name })),
      customer: setup.customers
        .filter((c) => !c.isSystem && pickable(c))
        .map((c) => ({ id: c.id, label: c.display })),
      supplier: setup.suppliers.filter(pickable).map((s) => ({ id: s.id, label: s.name })),
    };
    return { tab: "bank" as const, accounts, owners };
  }

  /** UIDD §4.13: the theme, the business, and this user's fingerprint devices (D-046). */
  @Get("settings")
  async settings() {
    const { userId } = context();
    const [profile, business, keys] = await Promise.all([
      this.auth.getProfile(),
      this.business.getBusiness(),
      userId ? this.passkeys.loadPasskeys(userId) : [],
    ]);
    const devices = keys.map((k) => ({
      id: k.id,
      name: k.deviceName ?? "This device",
      added: formatDate(dhakaToday(k.createdAt)),
      updatedAt: k.updatedAt.toISOString(),
    }));
    return {
      profile: profile && {
        id: profile.id,
        theme: profile.theme,
        updatedAt: profile.updatedAt.toISOString(),
      },
      business,
      logo: logoSrc(business),
      devices,
    };
  }

  /** UIDD §4.12 (task 6.4.2): the last export (time and who, from the audit log, D-017). */
  @Get("export")
  async exportPage() {
    return { last: await this.exports.lastExport() };
  }
}

export type MonthsView = Awaited<ReturnType<AdminViewsController["monthsList"]>>;
export type MonthView = Awaited<ReturnType<AdminViewsController["month"]>>;
export type SetupView = Awaited<ReturnType<AdminViewsController["setupLists"]>>;
export type SavedView = Awaited<ReturnType<AdminViewsController["saved"]>>;
export type SettingsView = Awaited<ReturnType<AdminViewsController["settings"]>>;
export type ExportView = Awaited<ReturnType<AdminViewsController["exportPage"]>>;
