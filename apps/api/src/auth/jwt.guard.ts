import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { type JWTPayload, createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import type { Config } from "../config";
import { CONFIG } from "../config.module";
import { context } from "./context";
import { IS_PUBLIC } from "./public";

// N-2.3 (D-068): every route needs a signed-in user unless it is @Public. The Supabase access
// token web forwards is verified here, locally: by the project's published keys (JWKS, ES256 or
// RS256) or, for a project still on the legacy shared secret, by SUPABASE_JWT_SECRET (HS256). No
// identity header is trusted. A signed-out token stays valid until it expires (≤ 1 h,
// jwt_expiry); web's proxy.ts sends the browser to /login at once.
@Injectable()
export class JwtGuard implements CanActivate {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly secret: Uint8Array | null;

  constructor(
    private readonly reflector: Reflector,
    @Inject(CONFIG) config: Config,
  ) {
    this.issuer = `${config.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
    this.secret = config.SUPABASE_JWT_SECRET
      ? new TextEncoder().encode(config.SUPABASE_JWT_SECRET)
      : null;
  }

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const header = ctx.switchToHttp().getRequest<Request>().header("authorization") ?? "";
    const token = /^Bearer (\S+)$/.exec(header)?.[1];
    const claims = token ? await this.verify(token) : null;
    if (!claims?.sub) throw new UnauthorizedException("Not signed in");
    const c = context();
    c.userId = claims.sub;
    c.email = typeof claims.email === "string" ? claims.email : null;
    return true;
  }

  /** The token's claims, or null when it is malformed, forged, expired or not a user's. */
  private async verify(token: string): Promise<JWTPayload | null> {
    const options = { audience: "authenticated", issuer: this.issuer };
    try {
      if (decodeProtectedHeader(token).alg === "HS256") {
        if (!this.secret) return null;
        const { payload } = await jwtVerify(token, this.secret, {
          ...options,
          algorithms: ["HS256"],
        });
        return payload;
      }
      const { payload } = await jwtVerify(token, this.jwks, {
        ...options,
        algorithms: ["ES256", "RS256"],
      });
      return payload;
    } catch {
      return null;
    }
  }
}
