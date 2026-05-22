import { hc } from "hono/client";
import type Service from "../types/worker.d.mts";

export function client(hostname?: string) {
  let host = hostname;

  if(!host) {
    host = process.env.SECRETS_PROXY_HOSTNAME;
  }

  if(!host) throw new Error("Could not determine secrets proxy hostname. Either set `SECRETS_PROXY_HOSTNAME` or supply a hostname to the RPC client");

  if(!host.startsWith("http")) {
    host = `https://${host}`;
  }
  
  return hc<typeof Service>(host);
}