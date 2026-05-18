import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { tokenCredentialsSchema, tokenSchema, type TokenCredentials } from "../schemas";

const configPath = path.join(
  os.homedir(),
  "/.dvm-secrets"
);
const credentialsPath = path.join(configPath, "credentials.json");

export async function saveCredentials(credentials: TokenCredentials) {
  await fs.promises.mkdir(configPath, { recursive: true });
  await Bun.file(credentialsPath).write(JSON.stringify(credentials));
}

export async function loadCredentials() {
  try {
    await fs.promises.mkdir(configPath, { recursive: true });
    const credentials = await Bun.file(credentialsPath).json();
    const parsed = tokenCredentialsSchema.parse(credentials);

    const payloadBase64 = parsed.accessToken.split(".").at(1);
    const payloadRaw = JSON.parse(Buffer.from(payloadBase64 ?? "", "base64").toString());

    const payload = tokenSchema.parse(payloadRaw);

    return {
      ...payload,
      ...parsed,
      get isExpired() {
        return payload.exp.getTime() < Date.now() - 1000 * 30;
      },
      get refreshExpired() {
        return parsed.refreshExp.getTime() < Date.now() - 1000 * 30;
      }
    }
  } catch(e) {
    try {
      await Bun.file(credentialsPath).delete();
    } catch {}
    return null;
  }
}