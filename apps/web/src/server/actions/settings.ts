"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { profiles } from "@/db/schema";
import type { Errors } from "@mbl/domain/guards";
import { themes } from "@mbl/domain/themes";
import { rowId } from "@mbl/domain/validation/fields";
import { runAction } from "@/server/action";

// UIDD §4.13 (D-037): Settings → Theme, saved on the user's own profile (all devices), audited
// like every other change.

const themeSchema = z.object({ id: rowId, theme: z.enum(themes) });

export async function setTheme(input: unknown) {
  return runAction(
    {
      op: "update",
      table: profiles,
      schema: themeSchema,
      guards: ({ current, userId }): Errors =>
        current?.userId === userId ? {} : { form: "You can change only your own theme" },
      write: async (tx, v) => {
        const [r] = await tx
          .update(profiles)
          .set({ theme: v.theme })
          .where(eq(profiles.id, v.id))
          .returning();
        return r;
      },
    },
    input,
  );
}
