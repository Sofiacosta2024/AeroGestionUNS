import { formatFullDate } from '@/lib/format';
import type { CheckState } from './use-schedule-check';

type Props = {
  check: CheckState;
  /** Si ya hay datos suficientes para consultar al servidor. */
  ready: boolean;
};

/**
 * Resultado del chequeo en vivo (RF-01, US1 criterio 3): muestra los choques de horario y
 * los datos que faltan antes de que el admin intente guardar.
 */
export default function CheckPanel({ check, ready }: Props) {
  if (!ready) {
    return (
      <Panel tone="neutral" icon="info">
        Completá ruta, avión, fecha y hora para verificar disponibilidad.
      </Panel>
    );
  }
  if (check.loading && !check.result) {
    return (
      <Panel tone="neutral" icon="progress_activity">
        Verificando horarios y capacidad…
      </Panel>
    );
  }
  if (check.errors.length > 0) {
    return (
      <Panel tone="warning" icon="edit_note" title="Faltan datos">
        <MessageList messages={check.errors} />
      </Panel>
    );
  }
  if (!check.result) return null;

  const { conflicts, issues, canSave, flightsCount } = check.result;
  if (canSave) {
    return (
      <Panel tone="success" icon="check_circle">
        Sin conflictos: {flightsCount === 1 ? 'el vuelo está listo' : `los ${flightsCount} vuelos están listos`} para guardar o
        publicar.
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-space-sm">
      {conflicts.length > 0 && (
        <Panel tone="error" icon="event_busy" title={`Choques de horario (${conflicts.length})`}>
          <MessageList
            messages={conflicts.map((c) => `${formatFullDate(c.date)} — ${c.message.replace(`${c.date}: `, '')}`)}
          />
        </Panel>
      )}
      {issues.length > 0 && (
        <Panel tone="warning" icon="edit_note" title="Datos a corregir">
          <MessageList messages={issues.map((i) => i.mensaje)} />
        </Panel>
      )}
    </div>
  );
}

const TONES = {
  neutral: 'bg-slate-50 border border-slate-200 text-slate-700',
  success: 'bg-emerald-50 border border-emerald-200 text-emerald-900',
  warning: 'bg-amber-50 border border-amber-200 text-amber-900',
  error: 'bg-rose-50 border border-rose-200 text-rose-900',
} as const;

const ICON_COLORS = {
  neutral: 'text-slate-500',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  error: 'text-[#E11D48]',
} as const;

function Panel(props: { tone: keyof typeof TONES; icon: string; title?: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-space-sm p-4 rounded-2xl shadow-sm ${TONES[props.tone]}`} role="status">
      <span className={`material-symbols-outlined text-[22px] shrink-0 mt-0.5 ${ICON_COLORS[props.tone]}`}>{props.icon}</span>
      <div className="flex flex-col gap-1 text-xs sm:text-sm">
        {props.title && <span className="font-bold text-sm">{props.title}</span>}
        <div>{props.children}</div>
      </div>
    </div>
  );
}

function MessageList({ messages }: { messages: string[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-0.5 font-body-sm text-body-sm">
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}
