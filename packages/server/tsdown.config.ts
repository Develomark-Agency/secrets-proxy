import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/worker.ts"],
  outDir: "../client/types",
  dts: {
    enabled: true,
    emitDtsOnly: true
  }
});