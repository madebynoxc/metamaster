// Node's global fetch identifies itself as "User-Agent: node", which Cloudflare
// challenges. Identifying the client properly is enough to get through.
export const USER_AGENT = 'metamaster/1.2 (+https://github.com/madebynoxc/metamaster)';

export function booruFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { 'User-Agent': USER_AGENT, ...options.headers },
  });
}

export async function fetchJson(url) {
  const res = await booruFetch(url);
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok || !contentType.includes('json')) {
    throw new Error(`responded ${res.status} ${res.statusText} (${contentType.split(';')[0] || 'no content-type'})`);
  }

  return res.json();
}
