"use client";

import { useState } from "react";
import { useToast } from "@/components/forms/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// D-041 (UIDD §4.16): Share PDF. The PDF is made on the server, then handed to the phone's share
// sheet (pick WhatsApp → the contact; a wa.me link can't attach a file). On a computer, or when
// sharing is refused or unsupported, it downloads.

const fileName = (res: Response) =>
  /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "document.pdf";

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function sharePdf(href: string) {
  const res = await fetch(href);
  if (!res.ok) throw new Error(`PDF ${res.status}`);
  const file = new File([await res.blob()], fileName(res), { type: "application/pdf" });
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (e) {
      // Cancelled in the share sheet: nothing to do. Refused (no user gesture left): download.
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  download(file);
}

export function SharePdfButton({
  href,
  variant = "outline",
  className,
}: {
  /** The `/pdf/…` URL; null while the input is incomplete (the button is disabled). */
  href: string | null;
  variant?: "outline" | "default";
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      disabled={!href || busy}
      className={cn("min-h-11 px-4", className)}
      onClick={async () => {
        setBusy(true);
        try {
          await sharePdf(href!);
        } catch {
          toast({ message: "Couldn't make the PDF" });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Making PDF…" : "Share PDF"}
    </Button>
  );
}
