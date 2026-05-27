import { $ } from "bun";
import packageJson from "../packages/client/package.json";

async function getVersions() {
  const versions = await $`gh release list --json name,tagName,publishedAt,isLatest`.quiet().json() as { isLatest: boolean, name: string, publishedAt: string, tagName: string }[];

  return versions.map(version => ({
    ...version,
    publishedAt: new Date(version.publishedAt)
  }));
}

async function pack() {
  await $`cd packages/server && bun run build:types`;
  await $`cd packages/client && bun pm pack`.quiet();
  const p = `./packages/client/secrets-proxy-client-${packageJson.version}.tgz`;
  const release = Bun.file(p);

  const success = await release.exists();
  if(!success) throw new Error("Error packing release");

  return p;
}

async function release(path: string) {
  await $`gh release create "${packageJson.version}" --title "Client v${packageJson.version}" --notes "" ${path}`;
}

const existingVersions = await getVersions();

if(existingVersions.some(v => v.tagName === packageJson.version)) {
  throw new Error(`A release with version ${packageJson.version} already exists. Either increment the version in ./packages/client/package.json, or delete the existing release.`);
}

const packPath = await pack();

await release(packPath);