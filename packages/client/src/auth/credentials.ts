import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { credentialsFileSchema, tokenSchema, type TokenCredentials } from "../schemas";
import { refresh } from "./refresh";

const configPath = path.join(os.homedir(), "/.dvm-secrets");
const credentialsPath = path.join(configPath, "credentials.json");

function findBestMatch(
  entries: Record<string, TokenCredentials>,
  cwd: string
) {
  let best: string | null = null;

  for(const dirKey of Object.keys(entries)) {
    if(cwd.startsWith(dirKey)) {
      if(best == null || dirKey.length > best.length) {
        best = dirKey;
      }
    }
  }

  if(best == null) return null;
  return { dirKey: best, credentials: entries[best]! };
}

export async function saveCredentials(
  credentials: TokenCredentials,
  dirKey?: string
) {
  await fs.promises.mkdir(configPath, { recursive: true });

  let entries: Record<string, TokenCredentials> = {};
  try {
    const raw = JSON.parse(await fs.promises.readFile(credentialsPath, "utf-8"));
    entries = credentialsFileSchema.parse(raw);
  } catch {}

  entries[dirKey ?? process.cwd()] = credentials;

  await fs.promises.writeFile(credentialsPath, JSON.stringify(entries, null, 2), "utf-8");
}

export async function loadCredentials() {
  try {
    await fs.promises.mkdir(configPath, { recursive: true });
    const raw = JSON.parse(await fs.promises.readFile(credentialsPath, "utf-8"));
    const entries = credentialsFileSchema.parse(raw);

    const match = findBestMatch(entries, process.cwd());
    if(!match) return null;

    const { dirKey, credentials } = match;

    const payloadBase64 = credentials.accessToken.split(".").at(1);
    const payloadRaw = JSON.parse(
      Buffer.from(payloadBase64 ?? "", "base64").toString(),
    );

    const payload = tokenSchema.parse(payloadRaw);

    return {
      dirKey,
      ...payload,
      ...credentials,
      get isExpired() {
        return Date.now() > payload.exp.getTime() - 1000 * 30;
      },
      get refreshExpired() {
        return Date.now() > credentials.refreshExp.getTime() - 1000 * 30;
      },
    };
  } catch {
    try {
      await fs.promises.unlink(credentialsPath);
    } catch {}
    return null;
  }
}

export async function loadCredentialsWithAutoRefresh() {
  let credentials = await loadCredentials();
  if(!credentials || credentials.refreshExpired) {
    throw new Error("Credentials are expired");
  }

  if(credentials.isExpired) {
    await refresh();
    credentials = await loadCredentials();
  }

  if(!credentials) throw new Error("Failed to load credentials");

  return credentials;
}