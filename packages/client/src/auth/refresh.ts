import { loadCredentials, saveCredentials } from "./credentials";
import { client } from "../rpc-client";

export async function refresh() {
  const creds = await loadCredentials();

  if(!creds) throw new Error("Credentials are missing or expired.");

  const res = await client.refresh.$post({
    json: { refreshToken: creds.refreshToken }
  });

  if(!res.ok) throw new Error("Credentials are missing or expired.");

  const data = await res.json();

  await saveCredentials({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    refreshExp: new Date(data.refresh_exp)
  });
}