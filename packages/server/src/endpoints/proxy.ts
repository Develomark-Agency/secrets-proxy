import { Hono } from "hono";
import { auth } from "../auth-middleware";
import { proxy as proxyFetch } from "hono/proxy";
import { env, waitUntil } from "cloudflare:workers";
import { apiKeySchema } from "../schemas";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

function hexToString(hexString: string) {
  const pairs = hexString.match(/.{1,2}/g);
  if(!pairs) return new Uint8Array(0);

  return new Uint8Array(pairs.map(byte => parseInt(byte, 16)));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function decryptApiProperties(apiProperties: string) {
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(env.API_SECRET));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyHash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  const [iv, ciphertext] = apiProperties.split(":").map(hexToString);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext
    );

    const plaintext = decoder.decode(decryptedBuffer);

    const parsed = JSON.parse(plaintext);

    const validated = apiKeySchema.parse(parsed);
    
    return validated;
  } catch(e) {
    return null;
  }
}

export const proxy = new Hono()
  .use(auth)
  .all("/*", async c => {
    const path = c.req.path.replace("/proxy/", "");
    const endpoint = new URL(`https://${path}`);

    const apiProperties = await env.KV.get(`api:${endpoint.hostname}`);

    if(apiProperties == null) {
      return c.text(`Invalid API hostname: ${path}`, 400);
    }

    const decrypted = await decryptApiProperties(apiProperties);
    if(decrypted == null) {
      console.error(`API key for ${endpoint.hostname} could not be decrypted, parsed, and/or validated.`);
      return c.text("Internal server error", 500);
    }

    for(const [key, value] of Object.entries(decrypted.query)) {
      endpoint.searchParams.set(key, value);
    }

    const res = await proxyFetch(endpoint, { raw: c.req.raw });

    const payload = c.get("payload");

    const db = drizzle(env.LOGS, { schema });

    let client;
    if(payload.type === "jwt") {
      res.headers.set("GH-USER", payload.payload.user);
      res.headers.set("TOKEN-EXP", new Date(payload.payload.exp * 1000).toString());
      client = payload.payload.user;
    } else {
      res.headers.set("DEPLOY-ID", payload.id);
      client = payload.id;
    }

    const bodySize = Number(c.req.header("content-length") || 0);

    waitUntil(db.insert(schema.logs).values({
      data: {
        client,
        endpoint: `${endpoint.host}${endpoint.pathname}`,
        method: c.req.method,
        status: res.status,
        statusText: res.statusText,
        bodySize,
        params: c.req.queries()
      }
    }));

    return res;
  });