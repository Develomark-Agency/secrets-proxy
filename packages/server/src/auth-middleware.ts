import { createMiddleware } from "hono/factory";
import z from "zod";
import { payloadSchema } from "./schemas";
import { verify } from "hono/jwt";
import { env } from "cloudflare:workers";
import { auth as parseBasicAuth } from "hono/utils/basic-auth";
import { timingSafeEqual } from "hono/utils/buffer";

interface Env {
  Variables: {
    payload: {
      type: "deploy-key",
      id: string
    } | {
      type: "jwt",
      payload: z.output<typeof payloadSchema>
    }
  }
}

export const auth = createMiddleware<Env>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  if(!authorization) return c.text("Unauthorized", 401);

  const basic = parseBasicAuth(c.req.raw);
  let bearer: string | undefined = undefined;
  if(authorization.toLowerCase().startsWith("bearer")) {
    bearer = authorization.split(" ").at(-1);
  }

  if(basic) {
    const isEqual = await timingSafeEqual(env.API_SECRET, basic.password);
    if(!isEqual) return c.text("Unauthorized", 401);

    c.set("payload", { type: "deploy-key", id: basic.username });

    return await next();
  } else if(bearer) {
    try {
      const result = await verify(bearer, env.API_SECRET, "HS256");
      c.set("payload", { type: "jwt", payload: result as z.output<typeof payloadSchema> });
      return await next();
    } catch(e) {}
  }

  return c.text("Unauthorized", 401);
});