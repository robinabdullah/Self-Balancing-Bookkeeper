import type { DraftSource } from "@mbl/api/messages/messages.service";
import type { SendView } from "@mbl/api/views/overlays.controller";
import { api } from "@/api/client";
import { withQuery } from "@mbl/domain/href";
import { SendSheet } from "./send-sheet";

// D-040: the send preview over an account page (`?send=`), like `BankOverlay`. The greeting and
// sign-off are the saved template's (D-039), filled in; How to pay offers the business's accounts.
// N-4.5: one `/views/send` read.
export async function SendOverlay({
  source,
  closeHref,
}: {
  source: DraftSource;
  closeHref: string;
}) {
  const view = await api<SendView>(withQuery("/views/send", source));
  if (!view) return null;
  const { draft, greeting, signOff, save, accounts } = view;
  return (
    <SendSheet
      key={JSON.stringify(source)}
      draft={draft}
      greeting={greeting}
      signOff={signOff}
      save={save}
      accounts={accounts}
      closeHref={closeHref}
    />
  );
}
