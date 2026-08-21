import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./src/auth/index.ts",
    "./src/fetch.ts",
    "./src/cli.ts"
  ],
  outDir: "./dist",
  dts: true,
  platform: "node"
});
