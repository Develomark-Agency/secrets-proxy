import { createMiddleware } from "hono/factory";
import z from "zod";
import { payloadSchema } from "./schemas";
import { verify } from "hono/jwt";
import { env } from "cloudflare:workers";

interface Env {
  Variables: {
    payload: {
      type: "deploy-key"
    } | {
      type: "jwt",
      payload: z.output<typeof payloadSchema>
    }
  }
}

export const auth = createMiddleware<Env>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  if(!authorization) return c.text("Unauthorized", 401);

  const bearer = authorization.split("Bearer").at(-1)?.trim();
  if(!bearer) return c.text("Unauthorized", 401);

  if(bearer === env.API_SECRET) {
    c.set("payload", { type: "deploy-key" });
    return await next();
  }

  try {
    const result = await verify(bearer, env.API_SECRET, "HS256");
    c.set("payload", { type: "jwt", payload: result as z.output<typeof payloadSchema> });
    return await next();
  } catch(e) {
    return c.text("Unauthorized", 401);
  }
});