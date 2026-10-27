import Link from "next/link";
import { Share2Icon } from "lucide-react";
import { withQuery } from "@/lib/href";

// UI rule 1 (D-040, D-043): a report page's title row and its one ⤴ Share icon, which opens the
// Report sheet over the page (`?report=1`).
export function ReportTitle({ title, base }: { title: string; base: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <Link
        href={withQuery(base, { report: "1" })}
        scroll={false}
        aria-label="Share"
        className="hover:bg-muted -mr-2 flex size-11 items-center justify-center rounded-lg"
      >
        <Share2Icon className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
