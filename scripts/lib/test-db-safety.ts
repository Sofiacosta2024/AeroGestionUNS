export const TEST_DB_DEFAULTS = {
  host: '127.0.0.1',
  port: '55432',
  database: 'aerogestion_us10a_test',
  user: 'aerogestion_us10a_test',
} as const;

type Env = Record<string, string | undefined>;

export type LocalTestDatabase = {
  url: string;
  sanitizedUrl: string;
  host: string;
  port: string;
  database: string;
  user: string;
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function requireValue(env: Env, key: string, fallback?: string): string {
  const value = env[key] ?? fallback;
  if (!value) throw new Error(`Falta ${key}. Copiar .env.test.example a .env.test y completar solo valores locales de test.`);
  return value;
}

function assertTestName(label: string, value: string): void {
  if (!/^[a-z][a-z0-9_]*_test$/.test(value)) {
    throw new Error(`${label} debe ser exclusivo de test y terminar en _test: ${value}`);
  }
  if (/^(postgres|template0|template1|production|prod|supabase)$/.test(value)) {
    throw new Error(`${label} no puede ser ${value}`);
  }
}

function normalizeHost(host: string): string {
  return host.replace(/^\[|\]$/g, '').toLowerCase();
}

export function assertLocalTestDatabaseUrl(rawUrl: string | undefined, env: Env = process.env): LocalTestDatabase {
  if (!rawUrl) throw new Error('Falta la URL de conexión de test local.');

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('La URL de conexión de test local no es válida.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`Protocolo no permitido: ${url.protocol}. Se esperaba postgresql://.`);
  }

  const host = normalizeHost(url.hostname);
  const expectedHost = normalizeHost(env.POSTGRES_TEST_HOST ?? TEST_DB_DEFAULTS.host);
  if (!LOCAL_HOSTS.has(host) || host !== expectedHost) {
    throw new Error(`Host no permitido: ${host}. La base de test debe ser local en ${expectedHost}.`);
  }

  const port = url.port || '5432';
  const expectedPort = env.POSTGRES_TEST_PORT ?? TEST_DB_DEFAULTS.port;
  if (port !== expectedPort) {
    throw new Error(`Puerto no permitido: ${port}. Se esperaba el puerto local de test ${expectedPort}.`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const expectedDatabase = env.POSTGRES_TEST_DB ?? TEST_DB_DEFAULTS.database;
  if (database !== expectedDatabase) {
    throw new Error(`Base de datos no permitida: ${database}. Se esperaba ${expectedDatabase}.`);
  }
  assertTestName('Base de datos', database);

  const user = decodeURIComponent(url.username);
  const expectedUser = env.POSTGRES_TEST_USER ?? TEST_DB_DEFAULTS.user;
  if (user !== expectedUser) {
    throw new Error(`Usuario no permitido: ${user}. Se esperaba ${expectedUser}.`);
  }
  assertTestName('Usuario', user);

  if (!url.password) throw new Error('La URL de test local no incluye contraseña.');
  const password = decodeURIComponent(url.password);
  if (env.POSTGRES_TEST_PASSWORD && password !== env.POSTGRES_TEST_PASSWORD) {
    throw new Error('La contraseña de la URL no coincide con POSTGRES_TEST_PASSWORD.');
  }

  for (const key of ['host', 'hostaddr', 'options', 'service']) {
    if (url.searchParams.has(key)) throw new Error(`Parámetro no permitido en la URL de test: ${key}.`);
  }
  const schema = url.searchParams.get('schema');
  if (schema && schema !== 'public') throw new Error(`Schema no permitido: ${schema}. Usar public.`);

  const sanitized = new URL(url.toString());
  sanitized.password = 'REDACTED';

  return {
    url: url.toString(),
    sanitizedUrl: sanitized.toString(),
    host,
    port,
    database,
    user,
  };
}

export function buildTestDatabaseUrl(env: Env = process.env): LocalTestDatabase {
  const host = requireValue(env, 'POSTGRES_TEST_HOST', TEST_DB_DEFAULTS.host);
  const port = requireValue(env, 'POSTGRES_TEST_PORT', TEST_DB_DEFAULTS.port);
  const database = requireValue(env, 'POSTGRES_TEST_DB', TEST_DB_DEFAULTS.database);
  const user = requireValue(env, 'POSTGRES_TEST_USER', TEST_DB_DEFAULTS.user);
  const password = requireValue(env, 'POSTGRES_TEST_PASSWORD');

  if (!LOCAL_HOSTS.has(normalizeHost(host))) {
    throw new Error(`Host de test no permitido: ${host}. Usar 127.0.0.1, localhost o ::1.`);
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error(`Puerto de test inválido: ${port}.`);
  }
  assertTestName('POSTGRES_TEST_DB', database);
  assertTestName('POSTGRES_TEST_USER', user);
  if (password.length < 8) throw new Error('POSTGRES_TEST_PASSWORD debe tener al menos 8 caracteres.');

  const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?schema=public`;
  return assertLocalTestDatabaseUrl(url, env);
}

export function assertSameTestDatabase(first: LocalTestDatabase, second: LocalTestDatabase): void {
  for (const key of ['host', 'port', 'database', 'user'] as const) {
    if (first[key] !== second[key]) {
      throw new Error(`Las URLs de test no apuntan al mismo destino (${key}).`);
    }
  }
}
