import { client } from "./rpc-client";

function parseUrl(input: string | URL | Request) {
  if(input instanceof URL) return input;
  if(typeof input === "string") return new URL(input);
  return new URL(input.url);
}

function buildProxyUrl(baseUrl: URL, requestUrl: URL) {
  const proxyUrl = new URL(baseUrl);
  proxyUrl.pathname = `/proxy/${requestUrl.hostname}${requestUrl.pathname}`;
  proxyUrl.search = requestUrl.search;
  proxyUrl.hash = requestUrl.hash;

  return proxyUrl;
}

export function createCommonFetch(
  hostname: string | (() => string),
  getAccessToken: () => Promise<string>
) {
  const host = typeof hostname === "string" ? hostname : hostname();
  const rpcClient = client(host);

  function url(input: string | URL | Request) {
    const baseUrl = rpcClient.proxy["*"].$url();
    const requestUrl = parseUrl(input);
    const proxyUrl = buildProxyUrl(baseUrl, requestUrl);

    return proxyUrl;
  }

  async function fetch(
    input: string | URL | Request,
    init?: RequestInit
  ) {
    const token = await getAccessToken();
    const u = url(input);

    let req;
    if(input instanceof Request) {
      req = new Request(u.href, {
        method: input.method,
        headers: {
          ...input.headers,
          ...init?.headers,
          Authorization: `Bearer ${token}`
        },
        body: input.body,
        redirect: input.redirect,
        credentials: input.credentials,
        cache: input.cache,
        mode: input.mode,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        integrity: input.integrity,
        keepalive: input.keepalive,
        signal: input.signal
      });
    } else {
      req = new Request(u.href, {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${token}`
        }
      });
    }

    return await globalThis.fetch(req);
  }

  return {
    url,
    fetch
  }
}