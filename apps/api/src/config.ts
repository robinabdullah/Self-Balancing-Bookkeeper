import { z } from "zod";

// N-2.2: the api's environment, checked once at boot. A missing or bad value stops the start
// with its name (never its value: some are secrets).
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Dev 3003 (web 3000); E2E 3002 (web 3001); parity 3012 (web 3011); production 4006.
  API_PORT: z.coerce.number().int().positive().default(3003),
  DATABASE_URL: z.url(),
  /** The Supabase project URL; its JWKS verifies sign-ins (N-2.3). */
  SUPABASE_URL: z.url(),
  /** Only for a project on the legacy shared JWT secret (HS256). */
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),
  /** N-3.8: the password check before a fingerprint set-up signs in with it (D-046). */
  SUPABASE_ANON_KEY: z.string().min(1),
  /**
   * N-3.8: saved card details (D-046), read when used: without it a save says NO_KEY, as in the
   * reference, and the api still starts.
   */
  CARD_SECRET_KEY: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join("."));
    throw new Error(`Bad api environment: ${[...new Set(names)].join(", ")}`);
  }
  return parsed.data;
}
