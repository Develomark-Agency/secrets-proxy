# Secrets Proxy

A secure proxy server that forwards authenticated requests to third-party APIs while keeping API keys safe server-side. Clients are authenticated to the proxy, and never receive the actual secrets. The server decrypts stored credentials and attaches them to forwarded requests.

## Architecture

### Server
Cloudflare Worker using Hono:
- Authenticates requests via Bearer tokens containing either a GitHub OAuth JWT or encoded deploy credentials.
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
Environment variables needed for server deployment are in [`.env.example`](https://github.com/Develomark-Agency/secrets-proxy/blob/main/packages/server/.env.example). The `SIGNING_SECRET`, `DEPLOY_DEVELOPMENT_SECRET`, `DEPLOY_PRODUCTION_SECRET`, `ALCHEMY_PASSWORD`, and `ALCHEMY_STATE_TOKEN` must be provided. Generate each secret separately with `openssl`. If you already have an `ALCHEMY_STATE_TOKEN` for a Cloudflare State Store in your Cloudflare account, you must use that. The `GITHUB_ORG_ID` is the ID of the organization (such as `Develomark-Agency`) that you want to ensure users belong to.

`SIGNING_SECRET` signs developer JWTs and encrypts stored sessions and API credentials. When upgrading from a deployment that used `API_SECRET`, set `SIGNING_SECRET` to the old `API_SECRET` value so existing encrypted data and sessions remain valid. Deploy clients should receive only `DEPLOY_DEVELOPMENT_SECRET` or `DEPLOY_PRODUCTION_SECRET`, never `SIGNING_SECRET`.

All proxy requests use Bearer authentication. Developer clients send their JWT as the token. Deploy clients send `base64(deployId + ":" + deploySecret)` as the token.

On the client side, the CLI must detect a `SECRETS_PROXY_HOSTNAME` in your environment. This can be done either with `SECRETS_PROXY_HOSTNAME='<hostname>' bunx secrets-proxy <command>`, or with an auto-loaded `.env` file.

### Fetch
To use the Secrets Proxy client in code, you must supply the hostname and a function to get the access token:
```ts
import { createCommonFetch } from "@secrets-proxy/client/fetch";
import { loadCredentialsWithAutoRefresh } from "@secrets-proxy/client/auth";

const { fetch } = createCommonFetch(
  "proxy.example.com",
  () => loadCredentialsWithAutoRefresh().then(c => ({
    mode: "development" as const,
    token: c.accessToken
  }))
);

const res = await fetch("https://external-api.com/get-resource?id=123");
// transformed to `https://proxy.example.com/proxy/external-api.com/get-resource?id=123`
// automatically attaches `Authorization Bearer <...>` from credentials
```

### Key Registry
External API keys are registered in the deployed KV store in Cloudflare. They are keyed by `api:<domain>`, and their values is an encrypted representation of the appropriate headers and query parameter keys.

To encrypt an API key, you can use the `encrypt` command in the CLI with `bunx secrets-proxy encrypt`, using the options:
- `--domain` (`-d`) The domain to match against when using this key
- `--environment` (`-e`) The environment that uses this secret: `production` (the default) or `development`
- `--type` (`-t`) The source of authentication (URL query parameter or request header)
- `--name` (`-n`) The header or query parameter name
- `--value` (`-v`) The value of the key
- `--key` (`-k`) Encryption key. Must be the same as the deployed proxy's `SIGNING_SECRET`.

You can also run `bunx secrets-proxy encrypt --interactive` to go through an interactive flow.

Production secrets use the existing `api:<domain>` key format. Development overrides use `api:development:<domain>`. GitHub-authenticated requests always use development credentials. Deploy-key requests use the environment bound to the verified deploy secret. If no development override exists, development requests fall back to the production credential so existing entries keep working.

For example, Clerk development and production credentials can share the same upstream hostname:

```sh
bunx secrets-proxy encrypt -d api.clerk.com -e production -t header -n Authorization -v "Bearer sk_live_..."
bunx secrets-proxy encrypt -d api.clerk.com -e development -t header -n Authorization -v "Bearer sk_test_..."
```

### Environment configuration sync

Non-secret environment configuration can be kept in the same KV namespace. Use the key format `env:<environment>:<name>`:

```text
env:development:USE_SOME_FEATURE = true
env:development:VITE_PUBLIC_KEY = pk_123abc
env:production:USE_SOME_FEATURE = false
```

Run `bunx secrets-proxy sync` to print the variables for your signed-in developer account as dotenv text. GitHub-authenticated developers always receive the development variables. Redirect the output or pass it to another command as needed:

```sh
bunx secrets-proxy sync > .env.local
```

CI can use a deploy key instead of a GitHub login. The verified deploy key selects either the development or production variables:

```sh
SECRETS_PROXY_DEPLOY_ID=my-app-build \
SECRETS_PROXY_DEPLOY_SECRET="$DEPLOY_PRODUCTION_SECRET" \
bunx secrets-proxy sync > .env
```

Only store configuration that is safe to place in the generated dotenv file under `env:`. Do not store proxy credentials or other secrets there.
