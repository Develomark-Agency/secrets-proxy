import { createMiddleware } from "hono/factory";
import z from "zod";
import { payloadSchema } from "./schemas";
import { verify } from "hono/jwt";
import { env } from "cloudflare:workers";
import { timingSafeEqual } from "hono/utils/buffer";
import { decodeBase64 } from "hono/utils/encode";

const bearerPattern = /^Bearer\s+(\S+)\s*$/i;
const deployCredentialsPattern = /^([^:]*):(.*)$/;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

interface Env {
  Variables: {
    payload: {
      type: "deploy-key",
      id: string,
      environment: "development" | "production"
    } | {
      type: "jwt",
      payload: z.output<typeof payloadSchema>
    }
  }
}

export const auth = createMiddleware<Env>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  if(!authorization) return c.text("Unauthorized", 401);

  const bearer = bearerPattern.exec(authorization)?.[1];
  if(!bearer) return c.text("Unauthorized", 401);

  try {
    const result = await verify(bearer, env.SIGNING_SECRET, "HS256");
    c.set("payload", { type: "jwt", payload: result as z.output<typeof payloadSchema> });
    return await next();
  } catch {}

  let deployCredentials;
  try {
    const decoded = utf8Decoder.decode(decodeBase64(bearer));
    const match = deployCredentialsPattern.exec(decoded);
    if(!match) return;

    deployCredentials = {
      deployId: match[1],
      key: match[2]
    }
  } catch {}

  if(!deployCredentials) return c.text("Unauthorized", 401);
  if(deployCredentials.deployId.trim() === "") return c.text("Deploy ID required", 400);

  const [usesDevelopmentKey, usesProductionKey] = await Promise.all([
    timingSafeEqual(env.DEPLOY_DEVELOPMENT_SECRET, deployCredentials.key),
    timingSafeEqual(env.DEPLOY_PRODUCTION_SECRET, deployCredentials.key)
  ]);
  if(!usesDevelopmentKey && !usesProductionKey) return c.text("Unauthorized", 401);

  c.set("payload", {
    type: "deploy-key",
    id: deployCredentials.deployId,
    environment: usesProductionKey ? "production" : "development",
  });

  return await next();
});
