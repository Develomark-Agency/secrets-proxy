import { sValidator } from "@hono/standard-validator";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { refreshBodySchema, sessionSchema } from "../../schemas";
import { checkUserInOrg, createTokenPayload, getOrgs } from "../../github";
import { throwOnStandardError } from "../../util/schema-validator";
import { LIFETIME } from "../../constants";
import { decryptSession, encryptSession } from "../../util/encryption";

export const refresh = new Hono()
  .post("/", sValidator("json", refreshBodySchema, throwOnStandardError()), async c => {
    const { refreshToken } = c.req.valid("json");

    const sessionEncrypted = await env.KV.get(`session:${refreshToken}`, "text");
    if(!sessionEncrypted) {
      await env.KV.delete(`session:${refreshToken}`);
      return c.text("Invalid or expired refresh token", { status: 401, statusText: "Unauthorized" });
    }

    const sessionRaw = await decryptSession(sessionEncrypted, env.API_SECRET);
    const sessionParsed = sessionSchema.safeParse(sessionRaw);

    if(!sessionParsed.success) {
      await env.KV.delete(`session:${refreshToken}`);
      return c.text("Invalid or expired refresh token", { status: 401, statusText: "Unauthorized" });
    }

    const orgs = await getOrgs(sessionParsed.data.githubToken, c);

    if(orgs instanceof Response) return orgs;

    const inOrg = checkUserInOrg(orgs, c);
    if(inOrg instanceof Response) {
      await env.KV.delete(`session:${refreshToken}`);
      return inOrg;
    }

    await env.KV.delete(`session:${refreshToken}`);
    
    const tokenPayload = createTokenPayload(sessionParsed.data.username);
    
    const newInternalToken = await sign(tokenPayload, env.API_SECRET, "HS256");

    const sessionData = {
      username: sessionParsed.data.username,
      githubToken: sessionParsed.data.githubToken
    }

    const newRefreshToken = crypto.randomUUID();
    const encryptedSessionData = await encryptSession(sessionData, env.API_SECRET);

    const refreshExp = new Date(Date.now() + LIFETIME.REFRESH_TOKEN * 1000);

    await env.KV.put(`session:${newRefreshToken}`, encryptedSessionData, {
      expirationTtl: LIFETIME.REFRESH_TOKEN
    });

    return c.json({
      access_token: newInternalToken,
      refresh_token: newRefreshToken,
      refresh_exp: refreshExp
    });
  });