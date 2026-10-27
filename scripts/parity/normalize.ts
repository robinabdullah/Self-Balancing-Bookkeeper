// N-1.1: the few values that differ between two runs of the same build, masked before dumps are
// compared. Each rule says why it exists; nothing else is masked, so any other difference shows.

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// ISO (JSON) and Postgres text forms: "2026-10-20T05:00:01.000Z", "2026-10-20 05:00:01.123+00".
const TIMESTAMP = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)?\b/g;
// The PDFs' "Generated 20 Oct 2026, 11:03 AM" is the server's clock at render (src/pdf/layout.ts).
const GENERATED = /(Generated \d{2} \w{3} \d{4}), \d{1,2}:\d{2}\s?[AP]M/g;

/**
 * Rows the write sequence saves get ids made in the browser (`crypto.randomUUID()`), so each
 * uuid becomes `<idN>` in order of first appearance: the same rows in the same order compare equal.
 */
export function aliasIds(text: string): string {
  const seen = new Map<string, string>();
  return text.replace(UUID, (id) => {
    const key = id.toLowerCase();
    if (!seen.has(key)) seen.set(key, `<id${seen.size + 1}>`);
    return seen.get(key)!;
  });
}

/** created_at/updated_at/at come from the DB's real clock (`now()`), which the harness can't fix. */
export const maskTimestamps = (text: string) => text.replace(TIMESTAMP, "<ts>");

/** The render time moves on with the run; the date stays (the harness's fixed today). */
export const maskGenerated = (text: string) => text.replace(GENERATED, "$1, <time>");
