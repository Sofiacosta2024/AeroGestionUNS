import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

test('el selector de perfil es presentacional y no autentica ni decide el acceso', () => {
  const portal = source('src', 'components', 'LoginPortal.tsx');
  assert.match(portal, /Seleccione su perfil/);
  assert.match(portal, /id: 'PASAJERO'/);
  assert.match(portal, /id: 'MOSTRADOR'/);
  assert.match(portal, /id: 'ADMIN'/);
  assert.doesNotMatch(portal, /useSignIn|useAuth|useClerk|signIn\.|roleHome|redirect\(/);
});

test('la redireccion posterior al login usa el rol real de la cuenta, no el perfil elegido', () => {
  const layout = source('src', 'app', '(auth)', 'login', 'layout.tsx');
  assert.match(layout, /const user = await getCurrentUser\(\)/);
  assert.match(layout, /if \(user\) redirect\(roleHome\(user\.role\)\)/);
});

test('los tres perfiles comparten el login propio y la misma ruta de Clerk', () => {
  const page = source('src', 'app', '(auth)', 'login', '[[...login]]', 'page.tsx');
  const form = source('src', 'components', 'LoginForm.tsx');

  assert.equal((page.match(/<LoginForm \/>/g) ?? []).length, 1);
  assert.equal((page.match(/<SignIn/g) ?? []).length, 1);
  assert.match(page, /path=\{CLERK_SIGN_IN_PATH\}/);
  assert.match(form, /signIn\.password\(\{ emailAddress: email\.trim\(\), password \}\)/);
  assert.match(form, /window\.location\.assign\(CLERK_SIGN_IN_PATH\)/);
});
