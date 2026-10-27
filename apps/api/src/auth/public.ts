import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "isPublic";

/** A route that needs no sign-in (health, branding). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
