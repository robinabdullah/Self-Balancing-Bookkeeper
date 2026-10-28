import type { CardSecretsView } from "@mbl/api/views/overlays.controller";
import { api } from "@/api/client";
import { OverlaySheet } from "@/components/bank/bank-sheet";
import { CardSecrets } from "./card-secrets";

// D-046 (UIDD §4.8): ⋯ → Manage → Card details opens this card's saved numbers over its page
// (`?secret=1`), masked, with Add (D-054: a supplementary card on the same bill too). N-4.5: one
// `/views/card-secrets/:cardId` read.
export async function CardSecretsOverlay({
  card,
  closeHref,
}: {
  card: { id: string; display: string };
  closeHref: string;
}) {
  const { items, hasPasskey } = await api<CardSecretsView>(`/views/card-secrets/${card.id}`);
  return (
    <OverlaySheet
      title="Card details"
      description={`${card.display}: saved card details`}
      closeHref={closeHref}
    >
      <CardSecrets
        items={items}
        cardId={card.id}
        hasPasskey={hasPasskey}
        empty="No saved details for this card yet."
      />
    </OverlaySheet>
  );
}
