'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatAmountInput, formatDayMonth, parseAmountInput } from '@/lib/format';
import { capacityField, validateClassEdits, type ClassEdit } from '@/lib/scheduling/capacity';
import type { FareClassView, FlightFaresUpdateResult, FlightFaresView } from '@/lib/scheduling/flight-fares';
import { apiRequest, errorDetails } from '../../../api-client';
import { MessageList, Panel } from '../../nuevo/check-panel';
import { INPUT } from '../../nuevo/schedule-section';

const SUCCESS_MESSAGE = 'Configuración de tarifas y capacidades actualizada correctamente';
const MAX_PRICE = 99_999_999;

/** Lo que el admin tiene escrito en una clase, tal cual (el precio en formato es-AR). */
type Draft = { capacity: string; price: string };
type Drafts = Record<string, Draft>;

const draftsOf = (flight: FlightFaresView): Drafts =>
  Object.fromEntries(
    flight.classes.map((c) => [c.fareId, { capacity: String(c.capacity), price: formatAmountInput(c.price) }]),
  );

/** Entero escrito en el campo; NaN si no es un entero. */
const parseCapacity = (raw: string) => (/^\d+$/.test(raw.trim()) ? Number(raw) : NaN);

type ClassRow = {
  view: FareClassView;
  capacity: number;
  price: number;
  capacityError: string | null;
  priceError: string | null;
  changed: boolean;
};

function priceError(price: number): string | null {
  if (Number.isNaN(price)) return 'Ingresá un importe válido (ej. 64.200 o 64.200,50)';
  if (price <= 0) return 'El precio debe ser mayor a 0';
  if (price > MAX_PRICE) return 'El precio es demasiado alto';
  return null;
}

/**
 * Valida lo escrito con las mismas reglas que el servidor (`validateClassEdits`): la
 * capacidad no baja de lo vendido y la cabina no se pasa de los asientos del avion.
 */
function evaluate(flight: FlightFaresView, drafts: Drafts) {
  const parsed = flight.classes.map((view) => {
    const draft = drafts[view.fareId]!;
    return { view, capacity: parseCapacity(draft.capacity), price: parseAmountInput(draft.price) };
  });
  const edits: ClassEdit[] = parsed.map(({ view, capacity }) => ({
    fareId: view.fareId,
    name: view.name,
    cabinClass: view.cabinClass,
    capacity: view.capacity,
    sold: view.sold,
    newCapacity: capacity > 0 ? capacity : view.capacity,
  }));
  const issues = validateClassEdits(edits, flight.cabinSeats);

  const rows: ClassRow[] = parsed.map(({ view, capacity, price }) => ({
    view,
    capacity,
    price,
    capacityError:
      capacity > 0
        ? (issues.find((i) => i.campo === capacityField(view.fareId))?.mensaje ?? null)
        : 'La capacidad debe ser un número entero mayor a 0',
    priceError: priceError(price),
    changed: capacity !== view.capacity || price !== view.price,
  }));

  return {
    rows,
    cabinIssues: issues.filter((i) => i.campo === 'fares').map((i) => i.mensaje),
    dirty: rows.some((r) => r.changed),
    valid: issues.length === 0 && rows.every((r) => !r.capacityError && !r.priceError),
  };
}

/**
 * Pantalla de edicion de tarifas y asientos por clase (US-11A, WF-11A). «Guardar
 * Configuración» se habilita solo si algun valor difiere de lo guardado y todo es valido.
 */
export default function FaresForm({ flight }: { flight: FlightFaresView }) {
  // Lo guardado en la base: contra esto se comparan los cambios. Se renueva al guardar.
  const [base, setBase] = useState(flight);
  const [drafts, setDrafts] = useState(() => draftsOf(flight));
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);

  const { rows, cabinIssues, dirty, valid } = evaluate(base, drafts);
  const canSave = base.editable && dirty && valid && !submitting;

  const update = (fareId: string, patch: Partial<Draft>) => {
    setSaved(false);
    setError(null);
    setDrafts((d) => ({ ...d, [fareId]: { ...d[fareId]!, ...patch } }));
  };

  const cancel = () => {
    setError(null);
    setDrafts(draftsOf(base));
  };

  async function save() {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const fares = rows
        .filter((r) => r.changed)
        .map((r) => ({ fareId: r.view.fareId, seatCapacity: r.capacity, price: r.price }));
      const result = await apiRequest<FlightFaresUpdateResult>('PATCH', `/api/admin/flights/${base.id}/fares`, { fares });
      setBase(result.flight);
      setDrafts(draftsOf(result.flight));
      setSaved(true);
    } catch (err) {
      // Un solo problema ya viene como mensaje principal: el detalle se muestra si hay varios.
      const details = errorDetails(err);
      setError({
        message: err instanceof Error ? err.message : 'No se pudo guardar la configuración',
        details: details.length > 1 ? details : [],
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-space-lg lg:px-margin pt-space-lg flex flex-col gap-space-lg">
      <FlightHeader flight={base} />

      {!base.editable && (
        <Panel icon="block" tone="warning">
          Las tarifas de este vuelo ya no se pueden editar: solo se editan vuelos programados o demorados que todavía no
          salieron.{' '}
          <Link className="underline font-bold" href={`/admin/itinerario?date=${base.date}`}>
            Volver a la planilla
          </Link>
        </Panel>
      )}

      {saved && (
        <Panel icon="check_circle" tone="success">
          {SUCCESS_MESSAGE}
        </Panel>
      )}

      <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-space-md" disabled={!base.editable || submitting}>
        <legend className="sr-only">Capacidad y precio por clase</legend>
        {rows.map((row) => (
          <ClassCard
            key={row.view.fareId}
            draft={drafts[row.view.fareId]!}
            onChange={(patch) => update(row.view.fareId, patch)}
            row={row}
          />
        ))}
      </fieldset>

      {cabinIssues.length > 0 && (
        <Panel icon="airline_seat_recline_normal" title="Capacidad de la aeronave" tone="warning">
          <MessageList messages={cabinIssues} />
        </Panel>
      )}

      {error && (
        <div
          className="flex flex-col gap-space-xs p-space-md rounded-xl font-label-md text-label-md bg-error-container text-on-error-container"
          role="alert"
        >
          <span className="font-bold">{error.message}</span>
          {error.details.length > 0 && <MessageList messages={error.details} />}
        </div>
      )}

      {base.editable && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!dirty && <span className="text-sm text-slate-500">Modificá un valor para habilitar el guardado.</span>}
          <button
            className="px-5 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={submitting}
            onClick={cancel}
            type="button"
          >
            Cancelar Cambios
          </button>
          <button
            className="px-6 py-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-sm shadow-lg shadow-rose-900/30 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!canSave}
            onClick={save}
            type="button"
          >
            {submitting ? 'Guardando…' : 'Guardar Configuración'}
          </button>
        </div>
      )}
    </div>
  );
}

function FlightHeader({ flight }: { flight: FlightFaresView }) {
  const { origin, destination } = flight.route;
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center gap-space-xs font-label-md text-label-md text-on-surface-variant">
        <span>Administración</span>
        <span className="text-outline-variant">/</span>
        <Link className="hover:underline" href={`/admin/itinerario?date=${flight.date}`}>
          Planilla del día
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-secondary font-bold">Editar tarifas</span>
      </div>
      <div className="flex flex-col gap-1 bg-[#2E1065] text-white p-space-lg rounded-xl shadow-md">
        <span className="w-fit px-2.5 py-0.5 rounded-full bg-rose-100 text-[#E11D48] font-mono text-xs font-black">
          {flight.code}
        </span>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
          {origin.city} ({origin.iataCode}) → {destination.city} ({destination.iataCode})
        </h1>
        <p className="text-sm text-purple-200">
          Edición de tarifas y asientos por clase · {formatDayMonth(flight.date)} {flight.date.slice(0, 4)} ·{' '}
          {flight.departureTime}
        </p>
      </div>
    </div>
  );
}

const LABEL = 'text-xs font-bold text-slate-500';

function ClassCard({ row, draft, onChange }: { row: ClassRow; draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  const { view } = row;
  const invalid = `${INPUT} border-rose-400 focus:border-rose-500`;

  return (
    <div className="bg-surface-container-lowest border border-slate-200 rounded-2xl p-space-lg flex flex-col gap-space-md shadow-sm">
      <h2 className="text-lg font-extrabold text-indigo-950">{view.name}</h2>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Capacidad total de asientos</span>
        <input
          aria-invalid={Boolean(row.capacityError)}
          className={row.capacityError ? invalid : INPUT}
          min={Math.max(view.sold, 1)}
          onChange={(e) => onChange({ capacity: e.target.value })}
          step={1}
          type="number"
          value={draft.capacity}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Precio base $</span>
        <div className="relative flex items-center">
          <input
            aria-invalid={Boolean(row.priceError)}
            className={`${row.priceError ? invalid : INPUT} pr-12`}
            inputMode="decimal"
            onBlur={() => {
              if (!row.priceError) onChange({ price: formatAmountInput(row.price) });
            }}
            onChange={(e) => onChange({ price: e.target.value.replace(/[^\d.,]/g, '') })}
            type="text"
            value={draft.price}
          />
          <span className="absolute right-3.5 text-xs font-bold text-slate-400 pointer-events-none">{view.currency}</span>
        </div>
      </label>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Pasajes vendidos actualmente</span>
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm">
          <span className="font-medium text-slate-500">{view.sold}</span>
          <span className="text-xs font-bold text-indigo-950">Solo lectura</span>
        </div>
      </div>

      {row.capacityError ? (
        <p className="text-xs font-semibold text-rose-700" role="alert">
          {row.capacityError}
        </p>
      ) : (
        <p className="text-xs text-slate-500">La capacidad no puede ser menor a {view.sold}.</p>
      )}
      {row.priceError && (
        <p className="text-xs font-semibold text-rose-700" role="alert">
          {row.priceError}
        </p>
      )}
    </div>
  );
}
