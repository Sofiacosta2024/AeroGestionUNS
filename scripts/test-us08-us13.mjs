// Crea y elimina únicamente su propio namespace temporal. Nunca migra public.
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
config({ path: ['.env.local', '.env'], quiet: true });
const source = process.env.DIRECT_URL;
if (!source) throw new Error('Configure DIRECT_URL para las pruebas PostgreSQL aisladas');
const schema = `codex_us08_test_${randomUUID().replaceAll('-', '')}`;
if (!/^codex_us08_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Namespace inválido');
const url = new URL(source); url.searchParams.set('schema', schema); url.searchParams.set('connection_limit', '8');
const db = new PrismaClient({ datasourceUrl: url.toString() });
let created = false;
try {
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  console.log('Pruebas PostgreSQL en namespace temporal aislado');
  const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString(), US08_TEST_SCHEMA: schema };
  const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, stdio: 'inherit' });
  if (migrated.status !== 0) throw new Error('No se pudieron aplicar las migraciones al namespace de prueba');
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test', '--test-concurrency=1', 'tests/database/us08-us13.test.ts'], { env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  if (created) { await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); console.log('Namespace de pruebas eliminado'); }
  await db.$disconnect();
}
