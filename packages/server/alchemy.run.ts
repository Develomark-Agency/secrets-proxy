import alchemy from "alchemy";
import { D1Database, KVNamespace, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { RandomString } from "alchemy/random";
import z from "zod";
import { styleText } from "node:util";

const env = z.object({
  GITHUB_ORG_ID: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  API_SECRET: z.string(),
  NODE_ENV: z.enum(["development", "production"]).optional().default("development")
}).parse(process.env);

const app = await alchemy("secrets-proxy", {
  stateStore: env.NODE_ENV === "production"
    ? scope => new CloudflareStateStore(scope)
    : undefined,
  adopt: true
});

const LOGS = await D1Database("logs", {
  migrationsDir: "./migrations"
});
const KV = await KVNamespace("kv");
const STATE_SECRET = await RandomString("STATE_SECRET");

export const worker = await Worker("worker", {
  entrypoint: "src/worker.ts",
  bindings: {
    KV,
    LOGS,
    STATE_SECRET: STATE_SECRET.value,
    API_SECRET: alchemy.secret(env.API_SECRET),
    GITHUB_ORG_ID: env.GITHUB_ORG_ID,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: alchemy.secret(env.GITHUB_CLIENT_SECRET)
  }
});

if(env.NODE_ENV === "production") {
  console.log(styleText("blue", "Deployed Secrets Proxy:"));
  console.log("\t" + worker.url);
}

await app.finalize();
