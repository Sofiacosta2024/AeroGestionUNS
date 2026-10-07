export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full max-w-[536px]">
      <div className="flex flex-col w-full items-center justify-center relative">
        <div className="absolute -top-32 -left-20 w-80 h-80 rounded-full bg-purple-300 opacity-40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-28 -right-20 w-96 h-96 rounded-full bg-pink-200 opacity-40 blur-3xl pointer-events-none" />

        <div className="w-full bg-surface-container-lowest rounded-2xl shadow-xl shadow-purple-950/5 p-5 sm:p-10 relative z-10 transition-all duration-300 border border-slate-100">
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

          <div className="mb-6 inline-flex items-center justify-center w-full px-3 py-2.5 rounded-lg bg-[#eef3ff] text-on-surface-variant font-label-md text-label-md text-center leading-snug">
            <span className="material-symbols-outlined text-sm mr-1.5 text-[#E11D48]">
              verified_user
            </span>
            Portal Unificado de Autenticación
          </div>
      <div className="space-y-6">
        {children}  
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
