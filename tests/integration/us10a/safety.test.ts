import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLocalTestDatabaseUrl,
  assertSameTestDatabase,
  buildTestDatabaseUrl,
} from '../../../scripts/lib/test-db-safety';

const env = {
  POSTGRES_TEST_HOST: '127.0.0.1',
  POSTGRES_TEST_PORT: '55432',
  POSTGRES_TEST_DB: 'aerogestion_us10a_test',
  POSTGRES_TEST_USER: 'aerogestion_us10a_test',
  POSTGRES_TEST_PASSWORD: 'local_test_password',
};

test('US-10A: acepta solo la URL PostgreSQL local de test', () => {
  const database = buildTestDatabaseUrl(env);
  assert.equal(database.host, '127.0.0.1');
  assert.equal(database.port, '55432');
  assert.equal(database.database, 'aerogestion_us10a_test');
  assert.equal(database.user, 'aerogestion_us10a_test');
  assert.match(database.url, /^postgresql:\/\//);
  assert.doesNotMatch(database.sanitizedUrl, /local_test_password/);
  assert.match(database.sanitizedUrl, /REDACTED/);
});

test('US-10A: rechaza hosts remotos aunque usen puerto y nombres de test', () => {
  assert.throws(
    () => assertLocalTestDatabaseUrl('postgresql://aerogestion_us10a_test:local_test_password@db.example.com:55432/aerogestion_us10a_test?schema=public', env),
    /Host no permitido/,
  );
});

test('US-10A: rechaza puerto distinto al configurado para test', () => {
  assert.throws(
    () => assertLocalTestDatabaseUrl('postgresql://aerogestion_us10a_test:local_test_password@127.0.0.1:5432/aerogestion_us10a_test?schema=public', env),
    /Puerto no permitido/,
  );
});

test('US-10A: rechaza bases y usuarios que no sean exclusivos de test', () => {
  assert.throws(() => buildTestDatabaseUrl({ ...env, POSTGRES_TEST_DB: 'production' }), /terminar en _test/);
  assert.throws(() => buildTestDatabaseUrl({ ...env, POSTGRES_TEST_USER: 'postgres' }), /terminar en _test/);
});

test('US-10A: rechaza parámetros que puedan redirigir la conexión', () => {
  assert.throws(
    () => assertLocalTestDatabaseUrl('postgresql://aerogestion_us10a_test:local_test_password@127.0.0.1:55432/aerogestion_us10a_test?schema=public&host=db.example.com', env),
    /Parámetro no permitido/,
  );
});

test('US-10A: rechaza una contraseña que no coincida con la configuración de test', () => {
  assert.throws(
    () => assertLocalTestDatabaseUrl('postgresql://aerogestion_us10a_test:otra_clave@127.0.0.1:55432/aerogestion_us10a_test?schema=public', env),
    /contraseña/,
  );
});

test('US-10A: compara que dos URLs apunten al mismo destino de test', () => {
  const first = buildTestDatabaseUrl(env);
  const second = buildTestDatabaseUrl(env);
  assert.doesNotThrow(() => assertSameTestDatabase(first, second));
  assert.throws(
    () => assertSameTestDatabase(first, { ...second, database: 'otra_base_test' }),
    /mismo destino/,
  );
});
