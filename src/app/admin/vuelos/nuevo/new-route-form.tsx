'use client';

import { useState } from 'react';
import type { FormRoute } from '@/lib/scheduling/form-data';
import { ApiRequestError, apiRequest, detailMessages } from '../../api-client';

type CreatedRoute = {
  id: string;
  code: string;
  originAirportId: string;
  destinationAirportId: string;
  durationMinutes: number;
  distanceKm: number | null;
};

type Props = {
  origin: string;
  destination: string;
  onCreated: (route: FormRoute) => void;
};

/**
 * Alta de una ruta que todavia no existe (RF-01, US1 criterio 1), sin salir del
 * formulario. La duracion es obligatoria: con ella se calcula la llegada de cada vuelo.
 */
export default function NewRouteForm({ origin, destination, onCreated }: Props) {
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const route = await apiRequest<CreatedRoute>('POST', '/api/routes', {
        code: `${origin}-${destination}`,
        originAirportId: origin,
        destinationAirportId: destination,
        durationMinutes: Number(duration),
        ...(distance ? { distanceKm: Number(distance) } : {}),
      });
      onCreated({
        id: route.id,
        code: route.code,
        origin: route.originAirportId,
        destination: route.destinationAirportId,
        durationMinutes: route.durationMinutes,
        distanceKm: route.distanceKm,
      });
    } catch (err) {
      const details = err instanceof ApiRequestError ? detailMessages(err.details) : [];
      setError(details[0] ?? (err instanceof Error ? err.message : 'No se pudo crear la ruta'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-rose-50/80 border border-rose-200 p-4 rounded-2xl shadow-sm" role="group" aria-label="Nueva ruta">
      <div className="flex items-center gap-2 text-slate-800 text-sm font-medium">
        <span className="material-symbols-outlined text-[#E11D48] text-lg">add_location_alt</span>
        <span>
          La ruta <span className="font-bold text-[#1F0A43]">{origin} → {destination}</span> todavía no existe. Cargá su
          duración para habilitarla y calcular el horario de arribo.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3 pt-1">
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">
          Duración estimada (minutos)
          <input
            className="w-36 bg-white border border-slate-300 focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 px-3.5 py-2 rounded-xl font-mono font-bold text-slate-900 shadow-sm focus:outline-none"
            min={1}
            max={1500}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Ej. 75"
            type="number"
            value={duration}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">
          Distancia (km, opcional)
          <input
            className="w-36 bg-white border border-slate-300 focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 px-3.5 py-2 rounded-xl font-mono font-bold text-slate-900 shadow-sm focus:outline-none"
            min={1}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="Ej. 580"
            type="number"
            value={distance}
          />
        </label>
        <button
          className="px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-xs sm:text-sm shadow-md shadow-rose-900/20 active:scale-[0.99] disabled:opacity-40 transition-all flex items-center gap-1.5"
          disabled={saving || !duration}
          onClick={create}
          type="button"
        >
          <span className="material-symbols-outlined text-[17px]">add_circle</span>
          <span>{saving ? 'Creando…' : 'Crear ruta'}</span>
        </button>
      </div>
      {error && <p className="font-label-md text-label-md text-red-600 font-bold">{error}</p>}
    </div>
  );
}
