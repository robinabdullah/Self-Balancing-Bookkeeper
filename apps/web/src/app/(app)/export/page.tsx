import { ExportButton } from "@/components/export/export-button";
import { formatStamp } from "@/lib/dates";
import { lastExport } from "@/server/export";

// UIDD §4.12 (task 6.4.2): the download, the last export (time and who, from the audit log,
// D-017) and the weekly-download note (PRD §4.7: the export is the backup).
export default async function ExportPage() {
  const last = await lastExport();
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Export</h1>
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Last export:{" "}
          <span data-testid="last-export">
            {last ? `${formatStamp(last.at)} by ${last.by}` : "never"}
          </span>
        </p>
        <ExportButton />
        <p className="text-muted-foreground text-sm">
          Download a copy every week and keep it safe: it is the only backup of the data. It also
          opens in Excel to share numbers.
        </p>
      </div>
    </>
  );
}
