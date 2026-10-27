import type { EditValues as ApiEditValues } from "@mbl/api/entries/entries.service";
import type {
  JournalEntry as ApiJournalEntry,
  JournalRow as ApiJournalRow,
} from "@mbl/api/journal/journal.service";
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
