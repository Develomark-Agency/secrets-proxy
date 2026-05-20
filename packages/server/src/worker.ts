import type { worker } from "../alchemy.run.ts";
import { Hono } from "hono";
import { login } from "./endpoints/auth/login";
import { callback } from "./endpoints/auth/callback";
import { refresh } from "./endpoints/auth/refresh";
import { ping } from "./endpoints/auth/ping";
import { proxy } from "./endpoints/proxy";

const app = new Hono()
  .route("/login", login)
  .route("/callback", callback)
  .route("/refresh", refresh)
  .route("/ping", ping)
  .route("/proxy", proxy);

export default app;