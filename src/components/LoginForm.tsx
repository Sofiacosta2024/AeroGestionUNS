'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSignIn } from '@clerk/nextjs';

export default function LoginForm() {
  const { signIn, fetchStatus } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aerogestion-login-email');
      if (saved) { setEmail(saved); setRememberEmail(true); }
    } catch { /* El login funciona también sin almacenamiento del navegador. */ }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || fetchStatus === 'fetching') return;
    setError('');
    setBusy(true);
    try {
      const result = await signIn.password({ emailAddress: email.trim(), password });
      if (result.error) {
        setError(result.error.longMessage || 'No se pudo iniciar sesión. Revisá tus datos.');
        return;
      }
      try {
        if (rememberEmail) localStorage.setItem('aerogestion-login-email', email.trim());
        else localStorage.removeItem('aerogestion-login-email');
      } catch { /* No se guardan contraseñas ni tokens en el navegador. */ }
      setPassword('');
      if (signIn.status === 'complete') {
        const finalized = await signIn.finalize({
          navigate: ({ decorateUrl }) => { window.location.assign(decorateUrl('/')); },
        });
        if (finalized.error) setError(finalized.error.longMessage || 'No se pudo activar la sesión.');
      } else {
        // Clerk completa MFA, confianza del dispositivo y demás desafíos pendientes.
        window.location.assign('/login/clerk');
      }
    } catch {
      setError('No se pudo conectar con el servicio de acceso. Intentá nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  const pending = busy || fetchStatus === 'fetching';
  const fieldClass = 'w-full rounded-lg border border-outline bg-white py-3.5 pl-12 pr-4 text-sm text-on-surface placeholder:text-outline focus:border-[#2E1065] focus:outline-none focus:ring-2 focus:ring-purple-100';

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold tracking-wide">
            <label htmlFor="login-email">Correo Institucional / Pasajero</label>
            <span className="text-outline">Requerido</span>
          </div>
          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute left-4 top-3.5 text-xl text-outline" aria-hidden="true">mail</span>
            <input id="login-email" type="email" autoComplete="username" placeholder="ejemplo@uns.edu.ar" required value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} />
          </div>
        </div>
        <div>
          <label htmlFor="login-password" className="mb-2 block text-xs font-bold tracking-wide">Contraseña</label>
          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute left-4 top-3.5 text-xl text-outline" aria-hidden="true">lock</span>
            <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Tu contraseña" required value={password} onChange={(event) => setPassword(event.target.value)} className={`${fieldClass} pr-12`} />
            <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 rounded p-1 text-outline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E11D48]">
              <span className="material-symbols-outlined text-xl" aria-hidden="true">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2 text-on-surface-variant">
            <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} className="h-4 w-4 rounded accent-[#E11D48]" />
            Recordar correo
          </label>
          <Link href="/login/clerk" className="font-semibold text-[#E11D48] hover:underline">¿Olvidó su clave?</Link>
        </div>
        {error && <p role="alert" className="rounded-lg bg-pink-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#2E1065] py-4 font-bold text-white shadow-lg shadow-purple-950/20 transition-colors hover:bg-[#431b80] disabled:cursor-wait disabled:opacity-60">
          {pending ? 'Iniciando sesión…' : 'Iniciar Sesión'}
          <span className="material-symbols-outlined text-xl" aria-hidden="true">arrow_forward</span>
        </button>
      </form>
      <div className="flex items-center gap-4 text-center text-xs font-bold uppercase tracking-wider text-outline">
        <span className="h-px flex-1 bg-blue-100" /><span>O continuar con</span><span className="h-px flex-1 bg-blue-100" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/login/clerk" className="rounded-xl bg-[#eef3ff] px-3 py-4 text-center text-sm font-semibold text-on-surface hover:bg-blue-100">Otras opciones de ingreso</Link>
        <Link href="/sign-up" className="rounded-xl bg-[#eef3ff] px-3 py-4 text-center text-sm font-semibold text-on-surface hover:bg-blue-100">Crear cuenta</Link>
      </div>
    </div>
  );
}
