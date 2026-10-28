import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json } from "express";
import { withContext } from "./auth/context";
import type { Config } from "./config";

// N-2.2: what main.ts and the test facade both apply to the app:
// - a 1 MB JSON limit, as Next's server actions have (the largest body is a logo, ≤ LOGO_MAX);
// - each request in its own context (auth/context.ts);
// - no exception filter and no trust proxy (only web calls the api, on 127.0.0.1);
// - Swagger at /docs only outside production (its UI files come from node_modules).
export function setupApp(app: INestApplication, config: Config) {
  (app as NestExpressApplication).use(json({ limit: "1mb" }), withContext);
  app.enableShutdownHooks();
  if (config.NODE_ENV !== "production") {
    const doc = new DocumentBuilder().setTitle("Self-Balancing Bookkeeper API").build();
    SwaggerModule.setup("docs", app, () => SwaggerModule.createDocument(app, doc));
  }
  return app;
}
