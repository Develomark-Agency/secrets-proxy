import { hc } from "hono/client";
import type Service from "../types/worker.d.mts";
import z from "zod";

const env = z.object({
  SECRETS_PROXY_HOSTNAME: z.string()
}).parse(process.env);

const hostname = env.SECRETS_PROXY_HOSTNAME.startsWith("http")
  ? env.SECRETS_PROXY_HOSTNAME
  : `https://${env.SECRETS_PROXY_HOSTNAME}`;

export const client = hc<typeof Service>(hostname);
