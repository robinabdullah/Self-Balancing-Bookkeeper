"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useToast } from "@/components/forms/toast";
import { Button } from "@/components/ui/button";

// UIDD §4.12: one button. It saves the file the server built, then refreshes the page so the
// "Last export" line shows this one.
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ExportButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/export/download", { method: "POST" });
      if (!res.ok || !res.headers.get("Content-Type")?.startsWith(XLSX)) throw new Error();
      const name = /filename="(.+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name ?? "self-balancing-bookkeeper.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      router.refresh();
    } catch {
      toast({ message: "Export failed — try again" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button className="min-h-11 w-full sm:w-fit" disabled={busy} onClick={download}>
      {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      Download all data (.xlsx)
    </Button>
  );
}
