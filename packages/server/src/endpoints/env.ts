import { Hono } from "hono";
import { env } from "cloudflare:workers";
import { auth } from "../auth-middleware";

const variableName = /^[A-Za-z_][A-Za-z0-9_]*$/;
const batchSize = 100;

function getEnvironment(payload: {
  type: "deploy-key";
  environment: "development" | "production";
} | {
  type: "jwt";
}) {
  return payload.type === "deploy-key" ? payload.environment : "development";
}

export const environment = new Hono()
  .use(auth)
  .get("/", async c => {
    const selectedEnvironment = getEnvironment(c.get("payload"));
    const prefix = `env:${selectedEnvironment}:`;
    const variables: Record<string, string> = {};
    let cursor: string | undefined;

    do {
      const page = await env.KV.list({ prefix, cursor });
      const names = page.keys.map(key => key.name);

      for(let start = 0; start < names.length; start += batchSize) {
        const batch = names.slice(start, start + batchSize);
        const values = await env.KV.get(batch, "text");

        for(const key of batch) {
          const name = key.slice(prefix.length);
          if(!variableName.test(name)) {
            return c.text(`Invalid environment variable name in KV: ${name}`, 500);
          }

          const value = values.get(key);
          if(value != null) variables[name] = value;
        }
      }

      cursor = page.list_complete ? undefined : page.cursor;
    } while(cursor);

    return c.json({ variables });
  });
