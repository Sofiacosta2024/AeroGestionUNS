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
  neutral: 'bg-surface-container-low text-on-surface-variant',
  success: 'bg-tertiary-fixed text-on-tertiary-fixed',
  warning: 'bg-secondary-fixed/60 text-on-secondary-fixed',
  error: 'bg-error-container text-on-error-container',
} as const;

function Panel(props: { tone: keyof typeof TONES; icon: string; title?: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-space-sm p-space-md rounded-xl ${TONES[props.tone]}`} role="status">
      <span className="material-symbols-outlined text-[20px] shrink-0">{props.icon}</span>
      <div className="flex flex-col gap-space-xs font-label-md text-label-md">
        {props.title && <span className="font-bold">{props.title}</span>}
        {props.children}
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
