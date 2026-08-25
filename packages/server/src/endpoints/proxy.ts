import { Hono } from "hono";
import { auth } from "../auth-middleware";
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
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(env.SIGNING_SECRET));

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

async function findMatchingKey(
  store: Pick<KVNamespace, "get" | "list">,
  endpoint: URL,
  prefix: string
) {
  const apiProperties = await store.list({ prefix: `${prefix}${endpoint.hostname}` });

  return apiProperties.keys
    .toSorted((a, b) => b.name.length - a.name.length)
    .find(key => (endpoint.hostname + endpoint.pathname).startsWith(key.name.slice(prefix.length)));
}

export async function matchEndpoint(
  store: Pick<KVNamespace, "get" | "list">,
  endpoint: URL,
  environment: "development" | "production"
) {
  if(environment === "development") {
    const developmentKey = await findMatchingKey(store, endpoint, "api:development:");
    if(developmentKey) return await store.get(developmentKey.name);
  }

  const productionKey = await findMatchingKey(store, endpoint, "api:");
  if(productionKey) return await store.get(productionKey.name);
}

export const proxy = new Hono()
  .use(auth)
  .all("/*", async c => {
    const path = c.req.path.replace("/proxy/", "");
    const endpoint = new URL(`https://${path}`);

    for(const [key, values] of Object.entries(c.req.queries())) {
      for(const v of values) {
        endpoint.searchParams.set(key, v);
      }
    }

    const payload = c.get("payload");
    const credentialEnvironment = payload.type === "deploy-key"
      ? payload.environment
      : "development";
    const apiProperties = await matchEndpoint(env.KV, endpoint, credentialEnvironment);

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

    const proxyHeaders = new Headers(c.req.header());
    proxyHeaders.delete("Authorization");
    
    for(const [key, value] of Object.entries(decrypted.headers)) {
      proxyHeaders.set(key, value);
    }

    const proxyReq = new Request(endpoint, {
      headers: proxyHeaders,
      body: c.req.raw.body,
      signal: c.req.raw.signal,
      method: c.req.raw.method,
      mode: c.req.raw.mode,
      credentials: c.req.raw.credentials,
      referrerPolicy: c.req.raw.referrerPolicy,
      referrer: c.req.raw.referrer,
      redirect: c.req.raw.redirect,
      cache: c.req.raw.cache,
      integrity: c.req.raw.integrity,
      keepalive: c.req.raw.keepalive
    });

    const res = await fetch(proxyReq);

    const db = drizzle(env.LOGS, { schema });
    
    let client;
    const resHeaders = new Headers(res.headers);
    if(payload.type === "jwt") {
      resHeaders.set("GH-USER", payload.payload.user);
      resHeaders.set("TOKEN-EXP", new Date(payload.payload.exp * 1000).toString());
      client = payload.payload.user;
    } else {
      resHeaders.set("DEPLOY-ID", payload.id);
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

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders
    });
  });
