import "./env";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { setupApp } from "./app";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";

async function main() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  setupApp(app, config);
  // Internal only: web calls it on 127.0.0.1; nginx never routes to it (D-068).
  await app.listen(config.API_PORT, "127.0.0.1");
}
void main();
