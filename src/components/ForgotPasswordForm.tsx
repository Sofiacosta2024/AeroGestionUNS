'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { SignIn, useSignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';
import { passwordRecoveryError } from '@/lib/password-recovery-error';

export default function ForgotPasswordForm() {
  const { signIn, fetchStatus } = useSignIn();
  const [step, setStep] = useState<'email' | 'code' | 'password' | 'challenge'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const pending = busy || fetchStatus === 'fetching';
  const isTestEmail = process.env.NODE_ENV === 'development' && /\+clerk_test[^@]*@/i.test(email);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || fetchStatus === 'fetching') return;
    setError('');
    if (step === 'password' && password !== confirmation) {
      setError('Las contraseñas no coinciden.'); return;
    }
    submitting.current = true; setBusy(true);
    try {
      if (step === 'email') {
        const created = await signIn.create({ identifier: email.trim() });
        if (created.error) { setError(passwordRecoveryError(created.error, 'No se pudo iniciar la recuperación.')); return; }
        const sent = await signIn.resetPasswordEmailCode.sendCode();
        if (sent.error) { setError(passwordRecoveryError(sent.error, 'No se pudo enviar el código. Intentá nuevamente.')); return; }
        setStep('code');
      } else if (step === 'code') {
        const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
        if (verified.error) { setError(passwordRecoveryError(verified.error, 'El código no es válido o venció.')); return; }
        setCode('');
        setStep(signIn.status === 'needs_new_password' ? 'password' : 'challenge');
      } else if (step === 'password') {
        const updated = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
        if (updated.error) { setError(passwordRecoveryError(updated.error, 'No se pudo actualizar la contraseña.')); return; }
        setPassword(''); setConfirmation(''); setStep('challenge');
        if (signIn.status !== 'complete') return;
        const finalized = await signIn.finalize({ navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) { setStep('challenge'); return; }
          window.location.assign(decorateUrl('/'));
        } });
        if (finalized.error) { setError(passwordRecoveryError(finalized.error, 'No se pudo activar la sesión.')); setStep('challenge'); }
      }
    } catch (error) {
      setError(passwordRecoveryError(error, 'No se pudo conectar con el servicio de acceso. Intentá nuevamente.'));
    } finally {
      submitting.current = false; setBusy(false);
    }
  }

  const fieldClass = 'w-full rounded-lg border border-outline bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200';
  return <section className="space-y-5" aria-labelledby="recovery-title">
    <h2 id="recovery-title" className="text-xl font-bold">Recuperar contraseña</h2>
    {step === 'challenge' ? <>
      <p className="text-sm">Completá la verificación de seguridad para continuar.</p>
      <SignIn routing="hash" signUpUrl="/sign-up" fallbackRedirectUrl="/" appearance={clerkAppearance} />
    </> : <form onSubmit={submit} className="space-y-4">
      {step === 'email' && <>
        <p className="text-sm text-on-surface-variant">Ingresá el correo de tu cuenta. Te enviaremos un código para recuperar el acceso.</p>
        <label className="block space-y-2"><span>Correo electrónico</span><input type="email" autoComplete="username" required disabled={pending} value={email} onChange={e => setEmail(e.target.value)} className={fieldClass} /></label>
      </>}
      {step === 'code' && <>
        <p role="status" className="text-sm">{isTestEmail
          ? 'Esta cuenta de pruebas no recibe emails de verificación. Usá el código de prueba 424242.'
          : 'Revisá tu correo e ingresá el código que te enviamos. Si no aparece, revisá spam.'}</p>
        <label className="block space-y-2"><span>Código de recuperación</span><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={pending} value={code} onChange={e => setCode(e.target.value)} className={fieldClass} /></label>
        <button type="button" disabled={pending} onClick={() => { setCode(''); setError(''); setStep('email'); }} className="text-sm text-[#E11D48] hover:underline">Volver a enviar o cambiar correo</button>
      </>}
      {step === 'password' && <>
        <p className="text-sm">Elegí una contraseña nueva. Se cerrarán las otras sesiones de tu cuenta.</p>
        <label className="block space-y-2"><span>Nueva contraseña</span><input type="password" autoComplete="new-password" required disabled={pending} value={password} onChange={e => setPassword(e.target.value)} className={fieldClass} /></label>
        <label className="block space-y-2"><span>Confirmar contraseña</span><input type="password" autoComplete="new-password" required disabled={pending} value={confirmation} onChange={e => setConfirmation(e.target.value)} className={fieldClass} /></label>
      </>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#2E1065] px-4 py-3 font-bold text-white disabled:opacity-60">{pending ? 'Procesando…' : step === 'email' ? 'Enviar código de recuperación' : step === 'code' ? 'Verificar código' : 'Guardar nueva contraseña'}</button>
    </form>}
    {error && <p role="alert" className="rounded-lg bg-pink-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <Link href="/login" className="block text-center text-sm font-semibold text-[#E11D48] hover:underline">Volver a iniciar sesión</Link>
  </section>;
}
