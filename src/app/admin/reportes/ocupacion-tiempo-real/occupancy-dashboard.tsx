'use client';

import { useCallback, useEffect, useState } from 'react';

type Cabin = { sold: number; capacity: number };
type Flight = { id: string; code: string; status: string; departureAt: string; route: string; classes: Record<string, Cabin> };
type Payload = { flights: Flight[]; summary: { totalSold: number; totalCapacity: number; averageLoadFactorPct: number; activeFlights: number } };
const cabins = [
  { id: 'ECONOMY', label: 'Economy' },
  { id: 'PREMIUM', label: 'Economy Premium' },
  { id: 'FIRST', label: 'Primera Clase' },
];
const statusNames: Record<string, string> = { PROGRAMADO: 'PROGRAMADO', EN_EMBARQUE: 'EN_EMBARQUE', COMPLETADO: 'COMPLETADO', CANCELADO: 'CANCELADO' };
const filters = [['TODOS', 'Todos'], ['PROGRAMADO', 'Programado'], ['EN_EMBARQUE', 'En embarque'], ['COMPLETADO', 'Completado'], ['CANCELADO', 'Cancelado']] as const;

function occupancyColor(pct: number) {
  return pct >= 80 ? '#16a06b' : pct >= 50 ? '#e0a000' : '#e11d48';
}

export default function OccupancyDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState('TODOS');
  const [error, setError] = useState('');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/v1/admin/reportes/ocupacion-tiempo-real?estado=${status}`, { cache: 'no-store', signal });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'No se pudo cargar la ocupación.');
      setData(body.data);
      setError('');
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la ocupación.');
    }
  }, [status]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh]);

  const number = new Intl.NumberFormat('es-AR');
  const percent = (value: number) => `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;

  return (
    <section className="mx-auto max-w-[1500px] px-6 pt-6 sm:px-8 lg:px-12 lg:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-primary">Ocupaci&oacute;n en tiempo real</h1>
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Pasajes vendidos', data ? number.format(data.summary.totalSold) : '—'],
          ['Factor de carga promedio', data ? percent(data.summary.averageLoadFactorPct) : '—'],
          ['Vuelos', data ? number.format(data.summary.activeFlights) : '—'],
          ['Vendidos / capacidad', data ? `${number.format(data.summary.totalSold)} / ${number.format(data.summary.totalCapacity)}` : '—'],
        ].map(([label, value]) => <article key={label} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm"><p className="text-sm font-medium text-on-surface-variant">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-primary">{value}</p></article>)}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3" aria-label="Filtrar por estado">
        <span className="mr-1 text-sm font-semibold text-on-surface-variant">Estado:</span>
        {filters.map(([value, label]) => <button key={value} onClick={() => setStatus(value)} aria-pressed={status === value} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${status === value ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-primary-fixed'}`} type="button">{label}</button>)}
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-on-surface-variant" aria-label="Referencias de ocupación">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" aria-hidden="true" />≥80%</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden="true" />50–79%</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-600" aria-hidden="true" />&lt;50%</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant"><tr><th className="px-4 py-3">Vuelo</th><th className="px-4 py-3">Estado</th>{cabins.map(cabin => <th key={cabin.id} className="px-4 py-3">{cabin.label}</th>)}</tr></thead>
          <tbody className="divide-y divide-outline-variant">
            {!data && !error && <tr><td colSpan={5} className="px-4 py-12 text-center text-on-surface-variant">Cargando ocupación…</td></tr>}
            {data?.flights.map(flight => <tr key={flight.id} className="hover:bg-surface-container-low"><td className="px-4 py-3"><strong className="text-primary">{flight.code}</strong><div className="mt-1 text-xs text-on-surface-variant">{flight.route} · {new Date(flight.departureAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div></td><td className="px-4 py-3"><span className="rounded-full bg-primary-fixed px-2.5 py-1 text-xs font-bold text-primary">{statusNames[flight.status] ?? flight.status}</span></td>{cabins.map(cabin => {
              const values = flight.classes[cabin.id] ?? { sold: 0, capacity: 0 };
              const pct = values.capacity ? values.sold / values.capacity * 100 : 0;
              const color = occupancyColor(pct);
              return <td key={cabin.id} className="px-4 py-3"><div className="mb-1 flex justify-between gap-2 text-xs"><span className="font-semibold">{number.format(values.sold)} / {number.format(values.capacity)}</span><span style={{ color }} className="font-bold">{percent(pct)}</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} /></div></td>;
            })}</tr>)}
            {data?.flights.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-on-surface-variant">No hay vuelos para el estado seleccionado.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
