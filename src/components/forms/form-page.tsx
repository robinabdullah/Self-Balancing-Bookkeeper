"use client";

import { useRouter } from "next/navigation";
import { FormBody, type FormBodyProps } from "./form-body";

// UIDD §3 (task 3.3.2): Purchase and Sale have repeatable lines, so they open as a full page.
// The footer (total + Save) sticks above the bottom tab bar. After a save the page goes to
// `done`; the "Saved · Undo" toast stays, as it lives in the app layout.

export function FormPage({
  title,
  done = "/",
  ...body
}: FormBodyProps & { title: string; done?: string }) {
  const router = useRouter();
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">{title}</h1>
      <FormBody {...body} page close={() => router.push(done)} />
    </>
  );
}
