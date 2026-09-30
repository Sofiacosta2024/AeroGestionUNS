'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Role = 'PASAJERO' | 'MOSTRADOR' | 'ADMIN';

/** Mismo contenido que el <script> original de login.html. */
const ROLE_DATA: Record<
  Role,
  { hint: string; label: string; selectorRole: string; icon: string; name: string }
> = {
  PASAJERO: {
    hint: 'Acceso a gestión de reservas, equipaje y check-in digital.',
    label: 'Correo Electrónico / Código de Reserva',
    selectorRole: 'pasajero',
    icon: 'flight_takeoff',
    name: 'Pasajero',
  },
  MOSTRADOR: {
    hint: 'Terminal de operaciones de despacho, equipaje y emisión de pases.',
    label: 'Legajo / Usuario Operativo',
    selectorRole: 'mostrador',
    icon: 'desk',
    name: 'Mostrador',
  },
  ADMIN: {
    hint: 'Gestión central de flota, rutas, tripulación y auditorías RBAC.',
    label: 'Identificador Administrativo UNS',
    selectorRole: 'admin',
    icon: 'admin_panel_settings',
    name: 'Admin',
  },
};

const ROLE_ORDER: Role[] = ['PASAJERO', 'MOSTRADOR', 'ADMIN'];

const BTN_BASE =
  'role-btn flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all duration-150';
const BTN_ACTIVE = `${BTN_BASE} bg-surface-container-lowest text-[#E11D48] shadow-sm`;
const BTN_IDLE = `${BTN_BASE} text-on-surface-variant hover:text-on-surface`;
const CAPTION_ACTIVE = 'font-label-sm text-label-sm font-bold tracking-tight';
const CAPTION_IDLE = 'font-label-sm text-label-sm font-semibold tracking-tight';

const BANNER_IDLE =
  'mb-5 inline-flex items-center justify-center w-full px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface-variant font-label-md text-label-md';
const BANNER_ERROR = `${BANNER_IDLE} bg-error-container text-on-error-container`;

type ApiErrorBody = { ok: false; error: { message: string } };

export default function LoginPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role>('PASAJERO');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [banner, setBanner] = useState<{ text: string; error: boolean }>({
    text: 'Portal Unificado de Autenticación',
    error: false,
  });

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // "Recordar sesion": si hay cookie vigente, se entra directo.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: { authenticated?: boolean } } | null) => {
        if (!cancelled && body?.data?.authenticated) router.replace('/vuelos');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [router]);

  // El acceso demo solo se ofrece si el servidor lo habilita (DEMO_MODE).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/demo', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: { enabled?: boolean } } | null) => {
        if (!cancelled) setDemoEnabled(body?.data?.enabled === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /** Entra con el usuario de ejemplo del perfil elegido, sin contrasena. */
  async function handleDemo() {
    if (demoLoading) return;
    setDemoLoading(true);
    setBanner({ text: 'Abriendo acceso demo...', error: false });
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, remember: true }),
      });
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      if (!res.ok || !body || 'error' in body) {
        setBanner({
          text: body && 'error' in body ? body.error.message : 'No se pudo abrir el acceso demo',
          error: true,
        });
        return;
      }
      setBanner({ text: 'Acceso demo concedido · redirigiendo...', error: false });
      router.replace('/vuelos');
      router.refresh();
    } catch {
      setBanner({ text: 'Error de conexión con el servidor', error: true });
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const email = emailRef.current?.value.trim() ?? '';
    const password = passwordRef.current?.value ?? '';

    if (!email || !password) {
      setBanner({ text: 'Complete correo y contraseña', error: true });
      return;
    }

    setLoading(true);
    setBanner({ text: 'Verificando credenciales...', error: false });

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, role, remember }),
      });

      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;

      if (!res.ok || !body || 'error' in body) {
        setBanner({
          text: body && 'error' in body ? body.error.message : 'No se pudo iniciar sesión',
          error: true,
        });
        return;
      }

      setBanner({ text: 'Acceso concedido · redirigiendo...', error: false });
      router.replace('/vuelos');
      router.refresh();
    } catch {
      setBanner({ text: 'Error de conexión con el servidor', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="w-full max-w-md">
      <div className="flex flex-col w-full items-center justify-center relative">
        <div className="absolute -top-32 -left-20 w-80 h-80 rounded-full bg-purple-300 opacity-40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-28 -right-20 w-96 h-96 rounded-full bg-pink-200 opacity-40 blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-xl shadow-purple-950/5 p-5 sm:p-8 relative z-10 transition-all duration-300 border border-slate-100">
          <div className="flex items-center justify-between pb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#2E1065] flex items-center justify-center shadow-md shadow-[#2E1065]/20 shrink-0">
                <svg
                  className="w-7 h-7 text-[#E11D48]"
                  fill="none"
                  viewBox="0 0 40 40"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 20.5L25.5 12L21 21.5L29 27L24 28L18 24.5L14 28.5L13.5 24L9 20.5Z"
                    fill="currentColor"
                  />
                  <circle cx="28.5" cy="13.5" fill="#f43f5e" r="2.8" />
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                    AeroGestión
                  </span>
                  <span className="font-headline-lg text-headline-lg text-[#E11D48] font-extrabold tracking-wide">
                    UNS
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-outline tracking-wider uppercase font-semibold leading-tight">
                  Sistema de Gestión Aérea
                </span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-100 text-[#E11D48] font-label-sm text-label-sm font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48] animate-pulse" />
              RF-07
            </span>
          </div>

          <div
            className={`${banner.error ? BANNER_ERROR : BANNER_IDLE} text-center leading-snug`}
            role={banner.error ? 'alert' : undefined}
            aria-live="polite"
          >
            <span className="material-symbols-outlined text-sm mr-1.5 text-[#E11D48]">
              {banner.error ? 'error' : 'verified_user'}
            </span>
            {banner.text}
          </div>

          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <label className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
                Seleccione su Perfil
              </label>
              <div
                className="grid grid-cols-3 gap-1.5 p-1.5 bg-surface-container-high rounded-xl"
                id="role-selector"
                role="radiogroup"
                aria-label="Perfil de acceso"
              >
                {ROLE_ORDER.map((r) => {
                  const active = r === role;
                  return (
                    <button
                      key={r}
                      className={active ? BTN_ACTIVE : BTN_IDLE}
                      data-role={ROLE_DATA[r].selectorRole}
                      onClick={() => setRole(r)}
                      role="radio"
                      aria-checked={active}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-xl mb-0.5">
                        {ROLE_DATA[r].icon}
                      </span>
                      <span className={active ? CAPTION_ACTIVE : CAPTION_IDLE}>
                        {ROLE_DATA[r].name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-start gap-1.5 mt-1 px-1">
                <span className="material-symbols-outlined text-xs text-[#E11D48] shrink-0 mt-0.5">
                  info
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug" id="role-hint">
                  {ROLE_DATA[role].hint}
                </p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label
                  className="font-label-md text-label-md text-on-surface font-semibold flex items-center justify-between"
                  htmlFor="email"
                >
                  <span id="email-label">{ROLE_DATA[role].label}</span>
                  <span className="font-label-sm text-label-sm text-outline">Requerido</span>
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-lg pointer-events-none">
                    mail
                  </span>
                  <input
                    ref={emailRef}
                    className="w-full bg-surface-container-lowest text-on-surface placeholder:text-outline-variant font-body-md text-body-md pl-11 pr-4 py-2.5 rounded-lg bg-surface-container-low focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-[#E11D48]/30 focus:border-[#E11D48] focus:shadow-md transition-all"
                    id="email"
                    name="email"
                    placeholder="ejemplo@uns.edu.ar"
                    required
                    type={role === 'MOSTRADOR' ? 'text' : 'email'}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    className="font-label-md text-label-md text-on-surface font-semibold"
                    htmlFor="password"
                  >
                    Contraseña
                  </label>
                  <span className="font-code-flight text-code-flight text-outline">SEC-V2</span>
                </div>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-lg pointer-events-none">
                    lock
                  </span>
                  <input
                    ref={passwordRef}
                    className="w-full bg-surface-container-lowest text-on-surface placeholder:text-outline-variant font-body-md text-body-md pl-11 pr-11 py-2.5 rounded-lg bg-surface-container-low focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-[#E11D48]/30 focus:border-[#E11D48] focus:shadow-md transition-all"
                    id="password"
                    name="password"
                    placeholder="••••••••••••"
                    required
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                  />
                  <button
                    className="absolute right-3.5 text-outline hover:text-[#2E1065] flex items-center justify-center p-1 transition-colors"
                    id="toggle-password"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-lg" id="eye-icon">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded bg-surface-container-highest text-[#E11D48] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#E11D48]"
                    type="checkbox"
                  />
                  <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                    Recordar sesión
                  </span>
                </label>
                <a
                  className="font-label-md text-label-md text-[#E11D48] hover:text-[#2E1065] font-semibold transition-colors"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setBanner({
                      text: 'La restablecimiento de clave se realiza en el Centro de Control BHI',
                      error: true,
                    });
                  }}
                >
                  ¿Olvidó su clave?
                </a>
              </div>

              <button
                className="w-full bg-[#2E1065] hover:bg-[#E11D48] text-on-secondary font-label-lg text-label-lg py-3 rounded-xl shadow-lg shadow-[#2E1065]/25 hover:shadow-[#E11D48]/30 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99] mt-2 group disabled:opacity-70 disabled:cursor-not-allowed"
                id="submit-btn"
                type="submit"
                disabled={loading}
              >
                <span>{loading ? 'Verificando...' : 'Iniciar Sesión'}</span>
                <span className="material-symbols-outlined text-base group-hover:translate-x-0.5 transition-transform">
                  arrow_forward
                </span>
              </button>
            </form>

            {demoEnabled && (
              <div className="flex flex-col gap-1.5">
                <button
                  className="w-full border border-dashed border-[#E11D48]/40 bg-[#E11D48]/[0.04] hover:bg-[#E11D48]/[0.09] text-[#2E1065] font-label-lg text-label-lg py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
                  id="demo-btn"
                  onClick={handleDemo}
                  type="button"
                  disabled={demoLoading}
                >
                  <span className="material-symbols-outlined text-lg text-[#E11D48]">
                    {demoLoading ? 'hourglass_top' : 'bolt'}
                  </span>
                  <span>
                    {demoLoading ? 'Entrando...' : `Acceso demo · ${ROLE_DATA[role].name}`}
                  </span>
                </button>
                <p className="text-center font-label-sm text-label-sm text-outline leading-snug">
                  Entra como {ROLE_DATA[role].name.toLowerCase()} sin contraseña. Solo para
                  desarrollo.
                </p>
              </div>
            )}

            <div className="relative flex items-center justify-center py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full h-px bg-surface-container-high" />
              </div>
              <span className="relative px-3 bg-surface-container-lowest font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
                o continuar con
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                className="flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors group"
                onClick={() =>
                  setBanner({
                    text: 'SSO UNS requiere la red institucional: valide con Casos de Nego',
                    error: true,
                  })
                }
                type="button"
              >
                <span className="w-5 h-5 rounded-full bg-[#2E1065] text-on-secondary flex items-center justify-center font-bold text-[10px] group-hover:scale-105 transition-transform">
                  U
                </span>
                <span className="font-label-md text-label-md text-on-surface font-semibold tracking-tight">
                  SSO UNS
                </span>
              </button>
              <button
                className="flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors group"
                onClick={() =>
                  setBanner({
                    text: 'GovID AR requiere el middleware de identidad del Estado',
                    error: true,
                  })
                }
                type="button"
              >
                <span className="material-symbols-outlined text-lg text-[#E11D48] group-hover:scale-105 transition-transform">
                  fingerprint
                </span>
                <span className="font-label-md text-label-md text-on-surface font-semibold tracking-tight">
                  GovID AR
                </span>
              </button>
            </div>

            <div className="pt-4 flex flex-col items-center gap-1.5 text-center">
              <div className="flex items-start gap-1.5 text-outline text-label-sm font-label-sm text-center">
                <span className="material-symbols-outlined text-xs shrink-0 mt-0.5">apartment</span>
                <span>Dpto. de Ciencias e Ingeniería de la Computación</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-2 text-outline-variant text-[11px] font-mono">
                <span>Universidad Nacional del Sur</span>
                <span>•</span>
                <span className="text-[#E11D48] font-semibold">v2.4.0-PROD</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 w-full max-w-md px-1 font-code-flight text-code-flight text-outline">
          <span className="flex items-center gap-1 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-[#E11D48] inline-block" />
            SISTEMA OPERACIONAL
          </span>
          <span className="text-[11px] tracking-widest uppercase">BHI // AIRPORT OPS</span>
        </div>
      </div>
    </main>
  );
}
