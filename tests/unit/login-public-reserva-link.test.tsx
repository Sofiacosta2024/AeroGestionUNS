import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PublicReservaLink from '../../src/components/PublicReservaLink';
import LoginPage from '../../src/app/(auth)/login/[[...login]]/page';

/** Busca un elemento del tipo indicado dentro de un arbol de React. */
function containsComponent(node: unknown, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => containsComponent(child, type));
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  return containsComponent((node.props as { children?: unknown }).children, type);
}

test('el enlace de consulta publica apunta a /reserva con el texto pedido', () => {
  const html = renderToStaticMarkup(createElement(PublicReservaLink));
  assert.match(html, /href="\/reserva"/);
  assert.match(html, /Consultar reserva sin iniciar sesión/);
});

test('la pagina de login muestra el enlace tanto en el login propio como en Clerk', async () => {
  // Rama /login (formulario propio): el link tiene que estar en la misma vista.
  const loginPropio = await LoginPage({ params: Promise.resolve({}) });
  assert.ok(
    containsComponent(loginPropio, PublicReservaLink),
    'el login propio debe ofrecer la salida publica a /reserva',
  );

  // Rama de Clerk (/login/clerk): conserva el link que ya existia.
  const clerk = await LoginPage({ params: Promise.resolve({ login: ['clerk'] }) });
  assert.ok(
    containsComponent(clerk, PublicReservaLink),
    'los pasos de Clerk deben ofrecer la salida publica a /reserva',
  );
});

test('el enlace no se duplica dentro de una misma vista del login', async () => {
  const count = (node: unknown): number => {
    if (Array.isArray(node)) return node.reduce<number>((acc, child) => acc + count(child), 0);
    if (!isValidElement(node)) return 0;
    const own = node.type === PublicReservaLink ? 1 : 0;
    return own + count((node.props as { children?: unknown }).children);
  };

  for (const login of [{}, { login: ['clerk'] }]) {
    const view = await LoginPage({ params: Promise.resolve(login) });
    assert.equal(count(view), 1, `la vista ${JSON.stringify(login)} debe tener un solo enlace`);
  }
});
