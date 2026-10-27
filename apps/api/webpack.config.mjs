import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import webpack from "webpack";

const require = createRequire(import.meta.url);
const __dirname = import.meta.dirname;

// N-2.1: one self-contained bundle (dist/main.js plus the PDF fonts), so the deploy copies a
// folder and needs no node_modules. swc keeps Nest's decorator metadata; `@mbl/*` ship raw .ts
// and react-pdf is ESM-only, so both are bundled, not required at run time.

// Nest requires these lazily only when a feature is used (microservices, websockets,
// class-validator pipes); none is installed, so they are left out instead of failing the build.
const LAZY = [
  "@nestjs/microservices",
  "@nestjs/microservices/microservices-module",
  "@nestjs/websockets",
  "@nestjs/websockets/socket-module",
  "@fastify/static",
  "class-transformer",
  "class-transformer/storage",
  "class-transformer/cjs/storage",
  "class-validator",
];

const swc = {
  loader: "swc-loader",
  options: {
    jsc: {
      parser: { syntax: "typescript", tsx: true, decorators: true },
      transform: {
        legacyDecorator: true,
        decoratorMetadata: true,
        react: { runtime: "automatic" },
      },
      target: "es2022",
    },
  },
};

const FONTS = path.join(__dirname, "../web/src/pdf/fonts");

const config = {
  target: "node",
  entry: "./src/main.ts",
  devtool: "source-map",
  output: { path: path.join(__dirname, "dist"), filename: "main.js", clean: true },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
    alias: { "server-only": false },
  },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: swc }] },
  // Swagger's UI runs only outside production (src/app.ts) and serves its files from the
  // swagger-ui-dist folder, so that one lazy require stays a node_modules lookup.
  externals: { "swagger-ui-dist/absolute-path.js": "commonjs swagger-ui-dist/absolute-path.js" },
  node: { __dirname: false, __filename: false },
  optimization: { minimize: false },
  ignoreWarnings: [
    /Critical dependency/,
    /Module not found: Error: Can't resolve '(bufferutil|utf-8-validate)'/,
  ],
  plugins: [
    new webpack.IgnorePlugin({
      checkResource(resource) {
        if (!LAZY.includes(resource)) return false;
        try {
          require.resolve(resource);
          return false;
        } catch {
          return true;
        }
      },
    }),
    {
      apply(compiler) {
        compiler.hooks.afterEmit.tap("copy-fonts", () =>
          fs.cpSync(FONTS, path.join(__dirname, "dist/fonts"), { recursive: true }),
        );
      },
    },
  ],
};

export default config;
