import { Injectable } from "@nestjs/common";
import { buildAlerts } from "@mbl/domain/alerts";
import { memo } from "../auth/memo";
import { BooksService } from "../books/books.service";
import { CardSecretsDataService } from "../card-secrets/card-secrets-data.service";
import { SetupDataService } from "../setup/setup-data.service";
import { StockService } from "../stock/stock.service";

// Ref: src/server/alerts.ts (CR-056).

@Injectable()
export class AlertsService {
  constructor(
    private readonly books: BooksService,
    private readonly setup: SetupDataService,
    private readonly stock: StockService,
    private readonly secrets: CardSecretsDataService,
  ) {}

  /**
   * SRS §15 (D-079, D-081): the alerts, once per render (`memo`). The layout's bell
   * (`/views/shell`) and the card page's fee chip (`/views/cards/:id`) share them, so the books,
   * Setup, lots and saved expiries are read once.
   */
  loadAlerts() {
    return memo("alerts", async () => {
      const [{ data, books, asOf }, setup, lots, feeMonths] = await Promise.all([
        this.books.loadBooks(),
        this.setup.loadSetup(),
        this.stock.allLots(),
        this.secrets.expiryMonths(),
      ]);
      return buildAlerts({ data, books, setup, feeMonths, lots, today: asOf });
    });
  }
}
