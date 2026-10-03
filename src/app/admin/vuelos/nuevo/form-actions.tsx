import Link from 'next/link';
import { formatFullDate } from '@/lib/format';
import type { SerializedSchedule } from '@/lib/scheduling/serializers';

type ActionBarProps = {
  canSubmit: boolean;
  submitting: 'draft' | 'publish' | null;
  flightsCount: number;
  isDraft: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
};

/** Card 3 del diseno: compromiso de publicacion y acciones. */
export function ActionBar(props: ActionBarProps) {
  const { canSubmit, submitting, flightsCount, isDraft, onSaveDraft, onPublish } = props;
  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xl flex flex-col lg:flex-row items-center justify-between gap-space-md">
      <div className="flex items-start gap-space-sm">
        <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-secondary shrink-0">
          <span className="material-symbols-outlined">gavel</span>
        </div>
        <div className="flex flex-col">
          <span className="font-label-md text-label-md text-primary font-bold">Publicación inmediata</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-2xl">
            Al publicar se {flightsCount === 1 ? 'genera 1 vuelo' : `generan ${flightsCount || 'los'} vuelos`} con su número
            AG-#### y quedan disponibles en el buscador. Un borrador no es visible para los pasajeros ni reserva el horario.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-space-sm w-full lg:w-auto justify-end shrink-0">
        <Link
          className="px-space-lg py-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-label-lg text-label-lg"
          href="/admin/itinerario"
        >
          Cancelar y volver
        </Link>
        <button
          className="flex items-center gap-space-xs px-space-md py-3 rounded-lg bg-surface-container-high text-primary hover:bg-surface-container-highest font-label-lg text-label-lg disabled:opacity-50"
          disabled={!canSubmit || submitting !== null}
          onClick={onSaveDraft}
          type="button"
        >
          <span className="material-symbols-outlined text-[20px]">bookmark</span>
          {submitting === 'draft' ? 'Guardando…' : isDraft ? 'Guardar cambios del borrador' : 'Guardar borrador'}
        </button>
        <button
          className="flex items-center gap-space-xs px-space-xl py-3.5 rounded-lg bg-secondary-container text-on-secondary hover:bg-secondary font-label-lg text-label-lg shadow-md disabled:opacity-50"
          disabled={!canSubmit || submitting !== null}
          onClick={onPublish}
          type="button"
        >
          <span className="material-symbols-outlined text-[20px]">send_time_extension</span>
          {submitting === 'publish' ? 'Publicando…' : 'Publicar vuelo'}
        </button>
      </div>
    </div>
  );
}

/** Confirmacion despues de publicar. */
export function PublishedPanel({ schedule, onNew }: { schedule: SerializedSchedule; onNew: () => void }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-md items-start">
      <div className="flex items-center gap-space-sm text-primary">
        <span className="material-symbols-outlined text-[32px] text-secondary">check_circle</span>
        <h2 className="font-headline-md text-headline-md">
          {schedule.flightsCount === 1 ? 'Se publicó 1 vuelo' : `Se publicaron ${schedule.flightsCount} vuelos`}
        </h2>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">
        {schedule.route.origin.iataCode} → {schedule.route.destination.iataCode} · salida {schedule.departureTime} ·{' '}
        {schedule.validFrom === schedule.validTo
          ? formatFullDate(schedule.validFrom)
          : `del ${formatFullDate(schedule.validFrom)} al ${formatFullDate(schedule.validTo)}`}
        . Ya están disponibles en el buscador.
      </p>
      <div className="flex flex-wrap gap-space-sm">
        <Link
          className="px-space-md py-3 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg"
          href={`/admin/itinerario?date=${schedule.validFrom}`}
        >
          Ver planilla del día
        </Link>
        <button
          className="px-space-md py-3 rounded-lg bg-surface-container text-primary font-label-lg text-label-lg"
          onClick={onNew}
          type="button"
        >
          Cargar otro vuelo
        </button>
      </div>
    </div>
  );
}
