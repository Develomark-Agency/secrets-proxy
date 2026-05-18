import { serve, type HttpBindings, type ServerType } from "@hono/node-server";
import { callbackQuerySchema, type TokenCredentials } from "../schemas";
import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";

export async function login(
  port: number,
  nonce: string
) {
  const { promise, resolve, reject } = Promise.withResolvers<TokenCredentials>();

  let server: ServerType | undefined = undefined;
  const app = new Hono<{ Bindings: HttpBindings }>()
    .get("/callback", sValidator("query", callbackQuerySchema), async c => {
      const { token, refresh, nonce: receivedNonce, refresh_exp } = c.req.valid("query");

      if(nonce !== receivedNonce) {
        c.env.outgoing.on("finish", () => {
          server?.close();
          reject(
            new Error("Security mismatch: Failed to login due to security mismatch. Please try again.")
          );
        });

        return c.html(
          "<h1>Security mismatch.</h1><p>Failed to login due to security mismatch. Please try again later.</p>"
        );
      }

      c.env.outgoing.on("finish", () => {
        server?.close();
        resolve({
          accessToken: token,
          refreshToken: refresh,
          refreshExp: refresh_exp
        });
      });

      return c.html(
        "<h1>Authentication successful</h1><p>You can safely close this browser tab.</p>"
      );
    });
  
  const timeout = setTimeout(() => {
    server?.close();
    reject(new Error("Timeout"));
  }, 1000 * 20);
  
  server = serve({ ...app, port });
  server.on("close", () => clearTimeout(timeout));

  return await promise;
}