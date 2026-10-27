import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Db } from "@mbl/db/client";
import { profiles } from "@mbl/db/schema";
import { DB } from "../db/db.module";
import { context } from "./context";
import { memo } from "./memo";

export type Profile = typeof profiles.$inferSelect;

// Ref: src/server/auth.ts (task 1.5). Reads need a sign-in (the guard); writes and files need a
// partner. The role is the user's `profiles` row, not a token claim, so a role change applies at
// once. The messages are the reference's, word for word.
@Injectable()
export class AuthService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The signed-in partner's profile; 401 "Not signed in" or 403 for anyone else. */
  requirePartner(): Promise<Profile> {
    const { userId } = context();
    if (!userId) return Promise.reject(new UnauthorizedException("Not signed in"));
    return memo("partner", async () => {
      const [profile] = await this.db
        .select()
        .from(profiles)
        .where(and(eq(profiles.userId, userId), eq(profiles.role, "partner")));
      if (!profile) throw new ForbiddenException("Only partners can do this");
      return profile;
    });
  }

  /** D-037: the signed-in user's profile (theme, and the id + `updatedAt` its action needs). */
  getProfile() {
    const { userId } = context();
    if (!userId) return Promise.resolve(null);
    return memo("profile", async () => {
      const [profile] = await this.db
        .select({ id: profiles.id, theme: profiles.theme, updatedAt: profiles.updatedAt })
        .from(profiles)
        .where(eq(profiles.userId, userId));
      return profile ?? null;
    });
  }
}
