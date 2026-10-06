'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell from './AuthShell';

const ROLES = [
  { id: 'PASAJERO', name: 'Pasajero', icon: 'flight_takeoff', hint: 'Gestioná tus reservas, equipaje y check-in.' },
  { id: 'MOSTRADOR', name: 'Mostrador', icon: 'desk', hint: 'Operaciones de despacho, equipaje y pases de abordar.' },
  { id: 'ADMIN', name: 'Admin', icon: 'admin_panel_settings', hint: 'Administración de vuelos, flota y rutas.' },
] as const;

type Role = (typeof ROLES)[number];

/** El perfil elegido organiza el portal; los permisos los determina la cuenta autenticada. */
export default function LoginPortal({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const router = useRouter();

  function backToRoles() {
    setRole(null);
    // Reinicia también los pasos de Clerk (contraseña, verificación, etc.).
    router.replace('/login');
  }

  return (
    <AuthShell>
      {role ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={backToRoles}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-[#2E1065] transition-colors hover:bg-purple-50 hover:text-[#E11D48] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48]"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_back</span>
            Volver a elegir rol
          </button>
          <div className="rounded-lg bg-purple-50 px-4 py-3">
            <p className="font-semibold text-[#2E1065]">Ingreso como {role.name}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{role.hint}</p>
          </div>
          {children}
        </div>
      ) : (
        <section aria-labelledby="login-role-title" className="space-y-4">
          <div>
            <h1 id="login-role-title" className="text-xl font-bold text-on-surface">Elegí tu rol</h1>
            <p className="mt-1 text-sm text-on-surface-variant">Seleccioná tu perfil para iniciar sesión.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRole(option)}
                className="flex flex-col items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-2 py-4 text-sm font-semibold text-[#2E1065] transition-colors hover:border-[#E11D48] hover:bg-pink-50 hover:text-[#E11D48] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48]"
              >
                <span className="material-symbols-outlined" aria-hidden="true">{option.icon}</span>
                {option.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </AuthShell>
  );
}
