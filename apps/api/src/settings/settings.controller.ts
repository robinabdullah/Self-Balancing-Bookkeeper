import { Body, Controller, Put, UseInterceptors } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { profiles } from "@mbl/db/schema";
import type { Errors } from "@mbl/domain/guards";
import { themes } from "@mbl/domain/themes";
import { rowId } from "@mbl/domain/validation/fields";
import { ResultStatus } from "../action/result-status";
import { Runner } from "../action/runner";
import { ZodBody } from "../swagger";

// Ref: src/server/actions/settings.ts. UIDD §4.13 (D-037): Settings → Theme, saved on the user's
// own profile (all devices), audited like every other change.

const themeSchema = z.object({ id: rowId, theme: z.enum(themes) });

@Controller("me")
@UseInterceptors(ResultStatus)
export class SettingsController {
  constructor(private readonly runner: Runner) {}

  @Put("theme")
  @ZodBody(themeSchema)
  setTheme(@Body() input: unknown) {
    return this.runner.runAction(
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
}
