import { Hono } from "hono";
import { loadCredentialsWithAutoRefresh } from "./credentials";
import { serve } from "@hono/node-server";

function createApp() {
  const app = new Hono()
    .get("/token", async c => {
      const creds = await loadCredentialsWithAutoRefresh();
      return c.json(creds);
    });
  
  return app;
}

export type App = Awaited<ReturnType<typeof createApp>>

export async function createWorkerFetcherServer() {
  const { resolve, promise: portPromise } = Promise.withResolvers<number>();

  serve(createApp(), ({ port }) => resolve(port));

  return await portPromise;
}