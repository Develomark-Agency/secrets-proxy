const batchSize = 100;

type EndpointStore = {
  get(keys: string[], type: "text"): Promise<Map<string, string | null>>;
};

export function getEndpointCandidates(endpoint: URL) {
  const paths = [endpoint.pathname];

  for(let index = endpoint.pathname.length - 1; index > 0; index--) {
    if(endpoint.pathname[index] === "/") {
      paths.push(endpoint.pathname.slice(0, index));
    }
  }

  paths.push("");

  return [...new Set(paths)].map(path => `${endpoint.hostname}${path}`);
}

export async function matchEndpoint(
  store: EndpointStore,
  endpoint: URL,
  environment: "development" | "production"
) {
  const endpoints = getEndpointCandidates(endpoint);
  const keys = environment === "development"
    ? [
        ...endpoints.map(candidate => `api:development:${candidate}`),
        ...endpoints.map(candidate => `api:${candidate}`)
      ]
    : endpoints.map(candidate => `api:${candidate}`);

  for(let start = 0; start < keys.length; start += batchSize) {
    const batch = keys.slice(start, start + batchSize);
    const values = await store.get(batch, "text");

    for(const key of batch) {
      const value = values.get(key);
      if(value != null) return value;
    }
  }
}
