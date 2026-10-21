import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { passwordRecoveryError } from '../src/lib/password-recovery-error';

// Exercise the real form handlers with an isolated Clerk client; no account is changed.
function formHarness(nodeEnv = 'test') {
  const states: any[] = []; let cursor = 0; const calls: string[] = [];
  let failure = '';
  const signIn: any = { status: 'needs_first_factor',
    create: async () => { calls.push('create'); return { error: failure === 'create' ? { longMessage: 'Cuenta inválida' } : failure === 'nested' ? { errors: [{ code: 'form_identifier_not_found' }] } : null }; },
    resetPasswordEmailCode: {
      sendCode: async () => { calls.push('send'); return { error: null }; },
      verifyCode: async () => { calls.push('verify'); if (failure === 'verify') return { error: { longMessage: 'Código incorrecto' } }; signIn.status = 'needs_new_password'; return { error: null }; },
      submitPassword: async () => { calls.push('password'); signIn.status = failure === 'mfa' ? 'needs_second_factor' : 'complete'; return { error: null }; },
    },
    finalize: async ({ navigate }: any) => { calls.push('finalize'); navigate({ decorateUrl: (p: string) => p }); return { error: null }; },
  };
  const req = createRequire(import.meta.url);
  const module = { exports: {} as any };
  const js = ts.transpileModule(readFileSync('src/components/ForgotPasswordForm.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(js, { module, exports: module.exports, process: { env: { NODE_ENV: nodeEnv } },
    window: { location: { assign: () => calls.push('navigate') } },
    require: (id: string) => {
      if (id === 'react') return {
        useState: (initial: any) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = v; }]; },
        useRef: (initial: any) => { const i = cursor++; return states[i] ??= { current: initial }; },
      };
      if (id === '@clerk/nextjs') return { useSignIn: () => ({ signIn, fetchStatus: 'idle' }), SignIn: 'ClerkChallenge' };
      if (id === 'next/link') return { __esModule: true, default: 'a' };
      if (id === '@/lib/clerk-appearance') return { clerkAppearance: {} };
      if (id === '@/lib/password-recovery-error') return { passwordRecoveryError };
      return req(id);
    },
  });
  let tree: any;
  function render() { cursor = 0; tree = module.exports.default(); }
  function nodes(node: any = tree): any[] {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(v => nodes(v));
    return [node, ...(node.props?.children ? nodes(node.props.children) : [])];
  }
  render();
  return { calls, signIn, fail: (v: string) => { failure = v; },
    change: (autocomplete: string, value: string) => { nodes().find(n => n.type === 'input' && n.props.autoComplete === autocomplete).props.onChange({ target: { value } }); render(); },
    passwords: (a: string, b: string) => { const inputs = nodes().filter(n => n.type === 'input'); inputs[0].props.onChange({ target: { value: a } }); inputs[1].props.onChange({ target: { value: b } }); render(); },
    submit: async () => { await nodes().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); render(); },
    alert: () => nodes().find(n => n.props?.role === 'alert')?.props.children,
    status: () => nodes().find(n => n.props?.role === 'status')?.props.children,
    challenge: () => nodes().some(n => n.type === 'ClerkChallenge'),
  };
}

test('recuperación envía código, lo verifica y actualiza antes de activar la sesión', async () => {
  const f = formHarness(); f.change('username', 'test@example.com'); await f.submit();
  f.change('one-time-code', '123456'); await f.submit(); f.passwords('synthetic-password', 'synthetic-password'); await f.submit();
  assert.deepEqual(f.calls, ['create', 'send', 'verify', 'password', 'finalize', 'navigate']);
});
test('un error de cuenta impide enviar código; un código inválido impide cambiar contraseña', async () => {
  const f = formHarness(); f.fail('create'); await f.submit(); assert.deepEqual(f.calls, ['create']); assert.equal(f.alert(), 'Cuenta inválida');
  const g = formHarness(); await g.submit(); g.fail('verify'); g.change('one-time-code', '000000'); await g.submit();
  assert.equal(g.alert(), 'Código incorrecto'); assert.ok(!g.calls.includes('password'));
});
test('confirmación distinta no actualiza credenciales y MFA no activa una sesión incompleta', async () => {
  const f = formHarness(); await f.submit(); f.change('one-time-code', '123456'); await f.submit();
  f.passwords('synthetic-password', 'different'); await f.submit(); assert.equal(f.alert(), 'Las contraseñas no coinciden.'); assert.ok(!f.calls.includes('password'));
  f.fail('mfa'); f.passwords('synthetic-password', 'synthetic-password'); await f.submit();
  assert.equal(f.challenge(), true); assert.ok(!f.calls.includes('finalize'));
});

test('muestra el error anidado real de Clerk y no anuncia envío si create falla', async () => {
  const f = formHarness(); f.fail('nested'); await f.submit();
  assert.equal(f.alert(), 'No encontramos una cuenta con ese correo. Revisalo o creá una cuenta.');
  assert.deepEqual(f.calls, ['create']);
  assert.equal(passwordRecoveryError({ errors: [{ longMessage: 'Mensaje del proveedor' }] }, 'fallback'), 'Mensaje del proveedor');
  assert.equal(passwordRecoveryError({ cause: { errors: [{ code: 'too_many_requests' }] } }, 'fallback'), 'Se hicieron demasiados intentos. Esperá unos minutos y volvé a probar.');
  assert.equal(passwordRecoveryError(new Error('internal technical details'), 'Mensaje seguro'), 'Mensaje seguro');
});

test('explica el código fijo sólo para correos de prueba en desarrollo', async () => {
  const local = formHarness('development'); local.change('username', 'mostrador+clerk_test@gmail.com'); await local.submit();
  assert.match(local.status(), /424242/);
  const prod = formHarness('production'); prod.change('username', 'mostrador+clerk_test@gmail.com'); await prod.submit();
  assert.doesNotMatch(prod.status(), /424242/);
  const real = formHarness('development'); real.change('username', 'test@example.com'); await real.submit();
  assert.doesNotMatch(real.status(), /424242/);
});
