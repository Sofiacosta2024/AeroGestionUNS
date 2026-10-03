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
    <div className="flex flex-col gap-space-sm bg-secondary-fixed/40 p-space-md rounded-xl" role="group" aria-label="Nueva ruta">
      <p className="font-label-md text-label-md text-on-surface">
        La ruta <span className="font-bold">{origin} → {destination}</span> todavía no existe. Cargá su
        duración para crearla.
      </p>
      <div className="flex flex-wrap items-end gap-space-sm">
        <label className="flex flex-col gap-space-xs font-label-sm text-label-sm uppercase text-on-surface-variant">
          Duración (min)
          <input
            className="w-32 bg-surface-container-lowest px-space-md py-2 rounded-lg font-code-telemetry text-code-telemetry text-primary border-0"
            min={1}
            max={1500}
            onChange={(e) => setDuration(e.target.value)}
            type="number"
            value={duration}
          />
        </label>
        <label className="flex flex-col gap-space-xs font-label-sm text-label-sm uppercase text-on-surface-variant">
          Distancia (km, opcional)
          <input
            className="w-36 bg-surface-container-lowest px-space-md py-2 rounded-lg font-code-telemetry text-code-telemetry text-primary border-0"
            min={1}
            onChange={(e) => setDistance(e.target.value)}
            type="number"
            value={distance}
          />
        </label>
        <button
          className="px-space-md py-2.5 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg disabled:opacity-50"
          disabled={saving || !duration}
          onClick={create}
          type="button"
        >
          {saving ? 'Creando…' : 'Crear ruta'}
        </button>
      </div>
      {error && <p className="font-label-md text-label-md text-error">{error}</p>}
    </div>
  );
}
