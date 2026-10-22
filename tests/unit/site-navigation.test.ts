import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buscarVuelosHref, siteHeaderPendingSections } from '../../src/lib/site-navigation';

const SECCIONES = [
  { path: 'mis-reservas', label: 'Mis Reservas' },
  { path: 'check-in-online', label: 'Check-in Online' },
  { path: 'alta-de-vuelos-admin', label: 'Alta de Vuelos [Admin]' },
] as const;

test('en la consulta publica de reservas, "Buscar vuelos" ofrece el acceso al login', () => {
  assert.equal(buscarVuelosHref('reserva'), '/login');
});

test('en el motor de vuelos, "Buscar vuelos" se mantiene en su propia seccion', () => {
  assert.equal(buscarVuelosHref('vuelos'), '/vuelos');
});

test('la consulta de reservas no ofrece el alta de vuelos de administracion', () => {
  const visibles = siteHeaderPendingSections('reserva', SECCIONES).map((s) => s.path);
  assert.deepEqual(visibles, ['mis-reservas', 'check-in-online']);
});

test('el motor de vuelos conserva todas las secciones pendientes, incluido admin', () => {
  const visibles = siteHeaderPendingSections('vuelos', SECCIONES).map((s) => s.path);
  assert.deepEqual(visibles, [
    'mis-reservas',
    'check-in-online',
    'alta-de-vuelos-admin',
  ]);
});

test('la barra compartida usa el destino calculado en los dos menus', () => {
  // SiteHeader no se puede renderizar en pruebas (useRouter/useClerk exigen los
  // providers de Next y Clerk), asi que se verifica el marcado: los dos menus
  // (escritorio y movil) usan el destino calculado y ninguno fija /vuelos a mano.
  const source = readFileSync(
    join(process.cwd(), 'src', 'components', 'SiteHeader.tsx'),
    'utf8',
  );
  const calculados = source.match(/href=\{vuelosHref\}/g) ?? [];
  assert.equal(calculados.length, 2, 'los dos menus deben usar el destino calculado');
  assert.equal(
    (source.match(/href="\/vuelos"/g) ?? []).length,
    0,
    'ningun link de la barra puede fijar /vuelos a mano',
  );
  assert.match(
    source,
    /import \{ buscarVuelosHref, siteHeaderPendingSections, type SiteHeaderPath \} from '@\/lib\/site-navigation';/,
  );
  const filtradas = source.match(/\{pendingSections\.map/g) ?? [];
  assert.equal(filtradas.length, 2, 'los dos menus deben usar la lista filtrada por seccion');
});
