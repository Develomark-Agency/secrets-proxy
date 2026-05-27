# Secrets Proxy

A secure proxy server that forwards authenticated requests to third-party APIs while keeping API keys safe server-side. Clients are authenticated to the proxy, and never receive the actual secrets. The server decrypts stored credentials and attaches them to forwarded requests.

## Architecture

### Server
Cloudflare Worker using Hono:
- Authenticates requests via GitHub OAuth (JWT) or deploy keys (Basic Auth).
  - Gates users based on GitHub organization
- Decrypts API credentials from Cloudflare KV
  - Attaches credentials as headers or query params
  - Proxies the request.
- Logs metadata for each request to D1 for observability

### Client
- CLI tool:
  - Facilitates GitHub OAuth login
  - Encrypts API secrets to put into KV
- `fetch` replacement creator:
  - Automatically injects credentials into a `fetch` request

## Usage

### Environment variables
Environment variables needed for server deployment are in [`.env.example`](https://github.com/Develomark-Agency/secrets-proxy/blob/main/packages/server/.env.example). The `API_SECRET`, `ALCHEMY_PASSWORD`, and `ALCHEMY_STATE_TOKEN` must be provided. It is recommended that they are generated with `openssl`. If you already have an `ALCHEMY_STATE_TOKEN` for a Cloudflare State Store in your Cloudflare account, you must use that. The `GITHUB_ORG_ID` is the ID of the organization (such as `Develomark-Agency`) that you want to ensure users belong to.

On the client side, the CLI must detect a `SECRETS_PROXY_HOSTNAME` in your environment. This can be done either with `SECRETS_PROXY_HOSTNAME='<hostname>' bunx secrets-proxy <command>`, or with an auto-loaded `.env` file.

### Fetch
To use the Secrets Proxy client in code, you must supply the hostname and a function to get the access token:
```ts
import { createCommonFetch } from "@secrets-proxy/client/fetch";
import { loadCredentialsWithAutoRefresh } from "@secrets-proxy/client/auth";

const { fetch } = createCommonFetch(
  "proxy.example.com",
  () => loadCredentialsWithAutoRefresh().then(c => c.accessToken)
);

const res = await fetch("https://external-api.com/get-resource?id=123");
// transformed to `https://proxy.example.com/proxy/external-api.com/get-resource?id=123`
// automatically attaches `Authorization Bearer <...>` from credentials
```

### Key Registry
External API keys are registered in the deployed KV store in Cloudflare. They are keyed by `api:<domain>`, and their values is an encrypted representation of the appropriate headers and query parameter keys.

To encrypt an API key, you can use the `encrypt` command in the CLI with `bunx secrets-proxy encrypt`, using the options:
- `--domain` (`-d`) The domain to match against when using this key
- `--type` (`-t`) The source of authentication (URL query parameter or request header)
- `--name` (`-n`) The header or query parameter name
- `--value` (`-v`) The value of the key
- `--key` (`-k`) Encryption key. Must be the same as the encryption key used in the deployed secrets proxy (`API_SECRET`).

You can also run `bunx secrets-proxy encrypt --interactive` to go through an interactive flow.
