import type { Bill as ApiBill } from "@mbl/api/accounts/accounts.service";
import type {
  BankAccount as ApiBankAccount,
  Owner as ApiOwner,
} from "@mbl/api/business/business.service";
import type { Business as ApiBusiness } from "@mbl/api/business/business.service";
import type { CardSecret as ApiCardSecret } from "@mbl/api/card-secrets/card-secrets-data.service";
import type { BillDatesRow as ApiBillDatesRow } from "@mbl/api/cards/card-detail.service";
import type { EditValues as ApiEditValues } from "@mbl/api/entries/entries.service";
import type {
  JournalEntry as ApiJournalEntry,
  JournalRow as ApiJournalRow,
} from "@mbl/api/journal/journal.service";
import type { Draft as ApiDraft } from "@mbl/api/messages/messages.service";
import type { PaidSince as ApiPaidSince } from "@mbl/api/months/months-data.service";
import type {
  BillLine as ApiBillLine,
  ReturnLot as ApiReturnLot,
} from "@mbl/api/returns/return-options.service";
import type { SetupData as ApiSetupData } from "@mbl/api/setup/setup-data.service";
import type { LotInfo as ApiLotInfo } from "@mbl/api/stock/lots";
import type { Jsonify } from "./jsonify";

// N-4.1 (design rule 7): the api's read types as the client components get them, after the JSON
// round trip (a Date arrives as its ISO string, e.g. the Setup rows' `createdAt`). Components that
// a `/views/*` page feeds import these, never `@/server/*`.
export type SetupData = Jsonify<ApiSetupData>;
export type JournalRow = Jsonify<ApiJournalRow>;
export type JournalEntry = Jsonify<ApiJournalEntry>;
export type EditValues = Jsonify<ApiEditValues>;
export type LotInfo = Jsonify<ApiLotInfo>;
export type BillLine = Jsonify<ApiBillLine>;
export type ReturnLot = Jsonify<ApiReturnLot>;
// N-4.5: the account pages and their overlays.
export type Bill = Jsonify<ApiBill>;
export type BillDatesRow = Jsonify<ApiBillDatesRow>;
export type Owner = Jsonify<ApiOwner>;
export type BankAccount = Jsonify<ApiBankAccount>;
export type CardSecret = Jsonify<ApiCardSecret>;
export type Draft = Jsonify<ApiDraft>;
// N-4.6: Settings' business and Re-open's warning.
export type Business = Jsonify<ApiBusiness>;
export type PaidSince = Jsonify<ApiPaidSince>;
