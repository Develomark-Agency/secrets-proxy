import { sValidator } from "@hono/standard-validator";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { LIFETIME } from "../../constants";
import { callbackQuerySchema, stateSchema } from "../../schemas";
import { checkUserInOrg, createTokenPayload, getOrgs, getToken, getUser } from "../../github";
import { throwOnStandardError } from "../../util/schema-validator";
import { encryptSession } from "../../util/encryption";

export const callback = new Hono()
  .get("/", sValidator("query", callbackQuerySchema, throwOnStandardError()), async c => {
    const { code, state: stateRaw } = c.req.valid("query");

    let decodedState;
    try {
      const payload = await verify(stateRaw, env.STATE_SECRET, "HS256");
      decodedState = stateSchema.parse(payload);
    } catch(e) {
      return c.text("Invalid, tampered, or expired state", {
        status: 403,
        statusText: "Forbidden"
      });
    }

    const { port, nonce } = decodedState;

    const githubToken = await getToken(code, c);
    if(githubToken instanceof Response) return githubToken;

    const orgs = await getOrgs(githubToken, c);

    if(orgs instanceof Response) return orgs;
    
    const inOrg = checkUserInOrg(orgs, c);
    if(inOrg instanceof Response) return inOrg;

    const user = await getUser(githubToken, c);

    if(user instanceof Response) return user;

    const tokenPayload = createTokenPayload(user.login);

    const internalToken = await sign(tokenPayload, env.API_SECRET, "HS256");

    const refreshToken = crypto.randomUUID();

    const sessionData = {
      username: user.login,
      githubToken
    }

    const encryptedSessionData = await encryptSession(sessionData, env.API_SECRET);

    const refreshExp = new Date(Date.now() + LIFETIME.REFRESH_TOKEN * 1000);

    await env.KV.put(`session:${refreshToken}`, encryptedSessionData, {
      expirationTtl: LIFETIME.REFRESH_TOKEN
    });

    const cliCallbackUrl = new URL(`http://localhost:${port}/callback`);
    cliCallbackUrl.searchParams.set("token", internalToken);
    cliCallbackUrl.searchParams.set("refresh", refreshToken);
    cliCallbackUrl.searchParams.set("nonce", nonce);
    cliCallbackUrl.searchParams.set("refresh_exp", refreshExp.toString());

    return c.redirect(cliCallbackUrl.toString());
  });