import { fillTemplate, firstPhone, template } from "@mbl/domain/business";
import { getBusiness, payAccounts } from "@/server/business";
import { type DraftSource, loadDraft } from "@/server/messages";
import { SendSheet } from "./send-sheet";

// D-040: the send preview over an account page (`?send=`), like `BankOverlay`. The greeting and
// sign-off are the saved template's (D-039), filled in; How to pay offers the business's accounts.
export async function SendOverlay({
  source,
  closeHref,
}: {
  source: DraftSource;
  closeHref: string;
}) {
  const [draft, business, accounts] = await Promise.all([
    loadDraft(source),
    getBusiness(),
    payAccounts(),
  ]);
  if (!draft) return null;
  const t = template(business?.templates, draft.type);
  const values = { name: draft.name, shop: business?.name, phone: firstPhone(business?.phones) };
  return (
    <SendSheet
      key={JSON.stringify(source)}
      draft={draft}
      greeting={fillTemplate(t.greeting, values)}
      signOff={fillTemplate(t.signOff, values)}
      save={
        business && {
          id: business.id,
          updatedAt: business.updatedAt,
          signOff: t.signOff,
          shop: business.name,
        }
      }
      accounts={accounts}
      closeHref={closeHref}
    />
  );
}
