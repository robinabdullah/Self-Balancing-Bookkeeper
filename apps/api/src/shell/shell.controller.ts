import { Controller, Get } from "@nestjs/common";
import { appName, logoSrc } from "@mbl/domain/business";
import { breakdown } from "@mbl/domain/dashboard";
import { formatMonth } from "@mbl/domain/dates";
import { nextToClose } from "@mbl/domain/engine/months";
import { AuthService } from "../auth/auth.service";
import { context } from "../auth/context";
import { Public } from "../auth/public";
import { BooksService } from "../books/books.service";
import { BusinessService } from "../business/business.service";

// N-2.5: what every page's frame reads. Ref: src/app/layout.tsx (the title and the theme),
// src/app/(app)/layout.tsx (the app shell, UIDD §3) and src/app/login/page.tsx (the name, logo).
@Controller()
export class ShellController {
  constructor(
    private readonly auth: AuthService,
    private readonly books: BooksService,
    private readonly business: BusinessService,
  ) {}

  /** D-039: the business's name and logo version, also on the login page (no sign-in). */
  @Public()
  @Get("branding")
  async branding() {
    const b = await this.business.getBusiness();
    return b && { name: b.name, shortName: b.shortName, logoVersion: b.logoVersion };
  }

  /** D-037: the signed-in user's profile (null: no profile row). */
  @Get("me")
  me() {
    return this.auth.getProfile();
  }

  /**
   * The top bar: the name, logo, user, "Closing: …" (task 4.1.4: it opens that month's close
   * screen, D-032) and the balance chip, from the books on every render (SRS §2).
   */
  @Get("views/shell")
  async shell() {
    const [{ data, books, asOf }, business] = await Promise.all([
      this.books.loadBooks(),
      this.business.getBusiness(),
    ]);
    const month = nextToClose(data.closed, data.entries[0]?.date ?? null, asOf);
    return {
      name: appName(business),
      logo: logoSrc(business),
      email: context().email ?? "",
      closing: { label: `Closing: ${formatMonth(month)}`, href: `/months/${month}` },
      balance: breakdown(books),
    };
  }
}

export type Branding = Awaited<ReturnType<ShellController["branding"]>>;
export type Me = Awaited<ReturnType<ShellController["me"]>>;
export type ShellView = Awaited<ReturnType<ShellController["shell"]>>;
