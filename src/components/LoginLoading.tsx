'use client'

import AuthShell from './AuthShell';

export default function LoginLoading() {
  return (
    <AuthShell>
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center" role="status" aria-live="polite" aria-busy="true">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-purple-100" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#2E1065]" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-on-surface">Preparando acceso seguro…</p>
          <p className="text-xs text-outline">Inicializando entorno de autenticaciónón</p>
        </div>
      </div>
    </AuthShell>
  );
}
