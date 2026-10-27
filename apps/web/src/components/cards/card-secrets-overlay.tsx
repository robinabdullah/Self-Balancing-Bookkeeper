import { OverlaySheet } from "@/components/bank/bank-sheet";
import { getUser } from "@/lib/supabase/server";
import { loadCardSecrets } from "@/server/card-secrets";
import { loadPasskeys } from "@/server/passkeys";
import { CardSecrets } from "./card-secrets";

// D-046 (UIDD §4.8): ⋯ → Manage → Card details opens this card's saved numbers over its page
// (`?secret=1`), masked, with Add (D-054: a supplementary card on the same bill too).
export async function CardSecretsOverlay({
  card,
  closeHref,
}: {
  card: { id: string; display: string };
  closeHref: string;
}) {
  const user = await getUser();
  const [items, keys] = await Promise.all([loadCardSecrets(), user ? loadPasskeys(user.id) : []]);
  return (
    <OverlaySheet
      title="Card details"
      description={`${card.display}: saved card details`}
      closeHref={closeHref}
    >
      <CardSecrets
        items={items.filter((s) => s.cardId === card.id)}
        cardId={card.id}
        hasPasskey={keys.length > 0}
        empty="No saved details for this card yet."
      />
    </OverlaySheet>
  );
}
