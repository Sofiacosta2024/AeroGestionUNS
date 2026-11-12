export type JsonHttpResult = {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function localUrl(baseUrl: string, path: string): URL {
  const url = new URL(path, baseUrl);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!LOCAL_HOSTS.has(host)) throw new Error(`HTTP de test no permitido fuera de localhost: ${host}`);
  return url;
}

export async function postJson(baseUrl: string, path: string, body: unknown, init: RequestInit = {}): Promise<JsonHttpResult> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(localUrl(baseUrl, path), {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, text, json };
}
