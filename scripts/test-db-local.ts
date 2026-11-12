import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, type LocalTestDatabase } from './lib/test-db-safety';

const ENV_FILE = '.env.test';

function fail(message: string): never {
  console.error(`[db:test] ${message}`);
  process.exit(1);
}

function loadTestDatabase(): { database: LocalTestDatabase; childEnv: NodeJS.ProcessEnv } {
  if (!existsSync(ENV_FILE)) {
    fail(`No existe ${ENV_FILE}. Copiar .env.test.example a ${ENV_FILE} y completar solo valores locales de test.`);
  }

  loadEnv({ path: ENV_FILE, quiet: true });
  const database = buildTestDatabaseUrl(process.env);
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    AEROGESTION_TEST_DB: '1',
    DATABASE_URL: database.url,
    DIRECT_URL: database.url,
    US10A_TEST_DB: '1',
  };

  console.log(`[db:test] Destino: ${database.sanitizedUrl}`);
  console.log(`[db:test] Host=${database.host} puerto=${database.port} base=${database.database} usuario=${database.user}`);
  console.log(`[db:test] Configuración cargada exclusivamente desde ${ENV_FILE}; .env.local y .env no se leen en este flujo.`);

  return { database, childEnv };
}

async function checkConnection(database: LocalTestDatabase): Promise<void> {
  const db = new PrismaClient({ datasourceUrl: database.url });
  try {
    const rows = await db.$queryRawUnsafe<Array<{ database: string; user: string; version: string }>>(
      'SELECT current_database() AS database, current_user AS "user", version() AS version',
    );
    const row = rows[0];
    if (!row) throw new Error('PostgreSQL no devolvió identidad de conexión.');
    if (row.database !== database.database) throw new Error(`Base conectada inesperada: ${row.database}`);
    if (row.user !== database.user) throw new Error(`Usuario conectado inesperado: ${row.user}`);
    console.log(`[db:test] Conexión OK: base=${row.database} usuario=${row.user}`);
    console.log(`[db:test] PostgreSQL: ${row.version.split(',')[0]}`);
  } finally {
    await db.$disconnect();
  }
}

function runNode(script: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(process.execPath, [script, ...args], { env, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`El comando terminó con código ${result.status ?? 'desconocido'}.`);
}

function prepareDatabase(env: NodeJS.ProcessEnv): void {
  console.log('[db:test] Aplicando migraciones únicamente sobre la base local de test validada.');
  runNode('node_modules/prisma/build/index.js', ['migrate', 'deploy'], env);
}

function runTests(files: string[], env: NodeJS.ProcessEnv): void {
  if (files.length === 0) fail('Indicar al menos un archivo de test para ejecutar.');
  runNode('node_modules/tsx/dist/cli.mjs', ['--tsconfig', 'tests/tsconfig.json', '--test', '--test-concurrency=1', ...files], env);
}

async function main(): Promise<void> {
  const action = process.argv[2] ?? 'check';
  const { database, childEnv } = loadTestDatabase();

  if (action === 'url') return;
  if (action === 'check') {
    await checkConnection(database);
    return;
  }
  if (action === 'prepare') {
    await checkConnection(database);
    prepareDatabase(childEnv);
    return;
  }
  if (action === 'run') {
    await checkConnection(database);
    runTests(process.argv.slice(3), childEnv);
    return;
  }

  fail(`Acción desconocida: ${action}. Usar url, check, prepare o run.`);
}

main().catch((error: unknown) => {
  console.error(`[db:test] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
