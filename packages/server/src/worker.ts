import type { worker } from "../alchemy.run.ts";
import { Hono } from "hono";
import { login } from "./endpoints/auth/login";
import { callback } from "./endpoints/auth/callback";
import { refresh } from "./endpoints/auth/refresh";

const app = new Hono()
  .route("/login", login)
  .route("/callback", callback)
  .route("/refresh", refresh);

export default app;