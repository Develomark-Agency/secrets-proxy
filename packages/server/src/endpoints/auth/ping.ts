import { Hono } from "hono";
import { auth } from "../../auth-middleware";

export const ping = new Hono()
  .use(auth)
  .get("/", async c => {
    return c.text("pong");
  });