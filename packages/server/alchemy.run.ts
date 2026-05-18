import alchemy from "alchemy";
import { KVNamespace, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { RandomString } from "alchemy/random";
import z from "zod";

const env = z.object({
  CLERK_SECRET_KEY: z.string(),
  CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_JWT_KEY: z.string(),
  CLERK_CLIENT_ID: z.string(),
  CLERK_CLIENT_SECRET: z.string(),
  CLERK_SLUG: z.string(),
  COOKIE_ENCRYPTION_KEY: z.string(),
  GITHUB_ORG_ID: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  NODE_ENV: z.enum(["development", "production"]).optional().default("development")
}).parse(process.env);

const app = await alchemy("secrets-proxy", {
  stateStore: env.NODE_ENV === "production"
    ? scope => new CloudflareStateStore(scope)
    : undefined
});

const KV = await KVNamespace("kv");
const STATE_SECRET = await RandomString("STATE_SECRET");
const API_SECRET = await RandomString("API_SECRET");

export const worker = await Worker("worker", {
  entrypoint: "src/worker.ts",
  bindings: {
    KV,
    CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY,
    CLERK_JWT_KEY: env.CLERK_JWT_KEY,
    CLERK_CLIENT_ID: env.CLERK_CLIENT_ID,
    CLERK_CLIENT_SECRET: alchemy.secret(env.CLERK_CLIENT_SECRET),
    CLERK_SLUG: env.CLERK_SLUG,
    COOKIE_ENCRYPTION_KEY: env.COOKIE_ENCRYPTION_KEY,
    STATE_SECRET: STATE_SECRET.value,
    API_SECRET: API_SECRET.value,
    GITHUB_ORG_ID: env.GITHUB_ORG_ID,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: alchemy.secret(env.GITHUB_CLIENT_SECRET)
  }
});

console.log(worker.url);

await app.finalize();
