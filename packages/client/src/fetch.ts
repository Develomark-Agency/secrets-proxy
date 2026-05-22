import { client } from "./rpc-client";

function parseUrl(input: string | URL | Request) {
  if(input instanceof URL) return input;
  if(typeof input === "string") return new URL(input);
  return new URL(input.url);
}

function extractHeaders(input: unknown) {
  if(input instanceof Request) return input.headers;
  return {}
}

function buildProxyUrl(baseUrl: URL, requestUrl: URL) {
  const proxyUrl = new URL(baseUrl);
  proxyUrl.pathname = `/proxy/${requestUrl.hostname}${requestUrl.pathname}`;
  proxyUrl.search = requestUrl.search;
  proxyUrl.hash = requestUrl.hash;

  return proxyUrl;
}

export function createCommonFetch(
  hostname: string,
  getAccessToken: () => Promise<string>
) {
  const rpcClient = client(hostname)

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

    const inputRequest = input instanceof Request ? input : undefined;

    const req = new Request({
      ...inputRequest,
      url: u.href,
      headers: {
        ...extractHeaders(inputRequest),
        ...init?.headers,
        Authorization: `Bearer ${token}`
      }
    });

    return await globalThis.fetch(req);
  }

  return {
    url,
    fetch
  }
}