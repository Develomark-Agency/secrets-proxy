import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { loginQuerySchema } from "../../schemas";
import { throwOnStandardError } from "../../util/schema-validator";
import { LIFETIME } from "../../constants";
import { sign } from "hono/jwt";
import { env } from "cloudflare:workers";
import { getAuthUrl } from "../../github";

export const login = new Hono()
  .get("/", sValidator("query", loginQuerySchema, throwOnStandardError()), async c => {
    const { cli_port, nonce } = c.req.valid("query");

    const statePayload = {
      port: cli_port,
      nonce,
      exp: Math.floor(Date.now() / 1000) + LIFETIME.STATE_TOKEN
    }

    const signedState = await sign(statePayload, env.STATE_SECRET, "HS256");

    const authUrl = getAuthUrl(signedState);

    return c.redirect(authUrl.href);
  });