'use client';

import { useState } from 'react';
import AuthShell from './AuthShell';

const ROLES = [
  { id: 'PASAJERO', name: 'Pasajero', icon: 'flight_takeoff', hint: 'Acceso a gestión de reservas, equipaje y check-in digital.' },
  { id: 'MOSTRADOR', name: 'Mostrador', icon: 'desk', hint: 'Operaciones de despacho, equipaje y emisión de pases.' },
  { id: 'ADMIN', name: 'Admin', icon: 'admin_panel_settings', hint: 'Administración de vuelos, flota, rutas y auditorías.' },
] as const;

/** El selector presenta el perfil; no modifica los permisos de la cuenta de Clerk. */
export default function LoginPortal({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<(typeof ROLES)[number]>(ROLES[0]);
  return (
    <AuthShell>
      <section aria-labelledby="login-role-title" className="space-y-3">
        <h1 id="login-role-title" className="text-xs font-bold uppercase tracking-wider text-outline">Seleccione su perfil</h1>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[#dce8ff] p-1.5" role="group" aria-label="Perfil de ingreso">
          {ROLES.map((option) => (
            <button key={option.id} type="button" aria-pressed={role.id === option.id} onClick={() => setRole(option)}
              className={`flex flex-col items-center gap-2 rounded-xl px-2 py-3 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48] ${role.id === option.id ? 'bg-white text-[#E11D48] shadow-sm' : 'text-on-surface-variant hover:bg-white/50'}`}>
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">{option.icon}</span>
              {option.name}
            </button>
          ))}
        </div>
        <p className="flex items-start gap-2 text-sm text-on-surface-variant" aria-live="polite">
          <span className="material-symbols-outlined mt-0.5 text-base text-[#E11D48]" aria-hidden="true">info</span>
          {role.hint}
        </p>
      </section>
      {children}
    </AuthShell>
  );
}
