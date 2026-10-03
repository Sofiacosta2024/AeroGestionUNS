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
      <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end shrink-0">
        <Link
          className="px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm transition-all flex items-center gap-1.5"
          href="/admin/itinerario"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Cancelar y volver</span>
        </Link>
        <button
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#1F0A43] hover:bg-[#2B0E5D] text-white font-bold text-sm shadow-md shadow-[#1F0A43]/20 hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canSubmit || submitting !== null}
          onClick={onSaveDraft}
          type="button"
        >
          <span className="material-symbols-outlined text-[19px] text-pink-300">bookmark</span>
          <span>{submitting === 'draft' ? 'Guardando…' : isDraft ? 'Guardar cambios del borrador' : 'Guardar borrador'}</span>
        </button>
        <button
          className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-sm shadow-lg shadow-rose-900/30 hover:shadow-rose-900/45 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canSubmit || submitting !== null}
          onClick={onPublish}
          type="button"
        >
          <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
          <span>{submitting === 'publish' ? 'Publicando…' : 'Publicar vuelo'}</span>
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
