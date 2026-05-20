import { Hono } from "hono";
import { auth } from "../auth-middleware";
import { proxy as proxyFetch } from "hono/proxy";

export const proxy = new Hono()
  .use(auth)
  .all("/*", async c => {
    const path = c.req.path.replace("/proxy/", "");
    const endpoint = `https://${path}`;

    const res = await proxyFetch(endpoint, c.req.raw);
    const payload = c.get("payload");
    if(payload.type === "jwt") {
      res.headers.set("GH-USER", payload.payload.user);
      res.headers.set("TOKEN-EXP", new Date(payload.payload.exp * 1000).toString());
    } else {
      res.headers.set("DEPLOY-ID", payload.id);
    }

    return res;
  });